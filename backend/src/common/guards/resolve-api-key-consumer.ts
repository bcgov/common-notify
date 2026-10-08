import { Logger } from '@nestjs/common'
import { In, IsNull, Repository } from 'typeorm'
import { ApiKeyConsumer } from '../../api/api-keys/entities/api-key-consumer.entity'

/** The gateway-injected headers that identify the caller's credential. */
export interface GatewayCredentialHeaders {
  credentialIdentifier?: string
  consumerUsername?: string
  consumerCustomId?: string
  consumerId?: string
  /**
   * ACL groups the consumer belongs to. Kong joins them with `, `. One is the product
   * environment's appId; the tenant's CSTAR id is there too once its consumer has been
   * granted it.
   */
  consumerGroups?: string[]
}

/**
 * Pull the credential-identifying headers Kong injects after key-auth succeeds.
 *
 * These are set by Kong itself and cleared when authentication fails, so a client
 * cannot forge them through the gateway.
 */
export function readGatewayCredentialHeaders(
  headers: Record<string, unknown>,
): GatewayCredentialHeaders {
  const read = (name: string): string | undefined => {
    const value = headers[name]
    return typeof value === 'string' && value.length > 0 ? value : undefined
  }

  return {
    credentialIdentifier: read('x-credential-identifier'),
    consumerUsername: read('x-consumer-username'),
    consumerCustomId: read('x-consumer-custom-id'),
    consumerId: read('x-consumer-id'),
    consumerGroups: parseConsumerGroups(read('x-consumer-groups')),
  }
}

/**
 * Split the ACL groups header.
 *
 * Kong emits `, ` between groups, but splitting on the comma alone and trimming costs
 * nothing and does not depend on that staying true. The header is present but empty for
 * a consumer in no groups.
 */
export function parseConsumerGroups(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((group) => group.trim())
    .filter(Boolean)
}

/**
 * Every header the gateway injected, for logging.
 *
 * Reads the raw headers rather than the parsed shape above, so the line shows what the
 * gateway actually sent — including anything we do not consume.
 *
 * Nothing here is secret. Kong sets these after it has already validated the key, and
 * none of them is the key itself.
 */
export function describeGatewayHeaders(headers: Record<string, unknown>): string {
  const injected = Object.keys(headers)
    .filter((name) => /^x-(consumer|credential|authenticated|anonymous)/i.test(name))
    .sort()
    .map((name) => `${name}=${String(headers[name])}`)

  return injected.length ? injected.join(' ') : '(none)'
}

/** True when the gateway gave us nothing to identify the credential with. */
export function hasNoCredentialHeaders(headers: GatewayCredentialHeaders): boolean {
  return !headers.credentialIdentifier && !headers.consumerUsername && !headers.consumerCustomId
}

/**
 * Resolve the tenant binding for a gateway-authenticated request.
 *
 * The binding is needed on every request regardless of what the headers say: notification
 * usage and limits hang off `api_key_consumer`, so knowing the tenant is not enough.
 * What the tenant's ACL group buys is a safe way to find a binding whose stored
 * credential identifier is wrong or missing.
 *
 *  1. `x-credential-identifier` → `credential_identifier`. The fast path, and where
 *     virtually every request lands.
 *  2. `x-consumer-username` / `x-consumer-custom-id` → `client_id`, narrowed to the
 *     tenant named by `x-consumer-groups`. Catches a key Notify has never seen used, and
 *     a key regenerated on the Portal — that mints a new Kong credential, leaving the
 *     stored identifier pointing at one that no longer exists.
 *  3. The same clientId match with no tenant to narrow it, restricted to bindings that
 *     have never been used. For consumers issued before ACL groups existed, which
 *     forward no tenant to match on. `clientId` is openly displayed — in the Notify UI
 *     and on the Portal Consumers page — so accepting it unqualified for the life of a
 *     key is a wider door than it needs to be; the restriction closes that path for a
 *     binding permanently once it has resolved once.
 *
 * A key revoked on the API Services Portal is rejected by the gateway and never gets
 * this far, so there is no revoked state to filter on here.
 *
 * @returns the binding with its tenant loaded, or null when the key is unbound
 */
export async function resolveApiKeyConsumer(
  repository: Repository<ApiKeyConsumer>,
  headers: GatewayCredentialHeaders,
  logger: Logger,
  rawHeaders?: Record<string, unknown>,
): Promise<ApiKeyConsumer | null> {
  const { credentialIdentifier, consumerUsername, consumerCustomId, consumerGroups } = headers

  if (rawHeaders) {
    logger.debug(`Gateway headers: ${describeGatewayHeaders(rawHeaders)}`)
  }

  if (credentialIdentifier) {
    const byCredential = await repository.findOne({
      where: { credentialIdentifier },
      relations: ['tenant'],
    })
    if (byCredential) {
      return byCredential
    }
  }

  const clientIds = [...new Set([consumerUsername, consumerCustomId].filter(Boolean))] as string[]
  if (clientIds.length === 0) {
    return null
  }

  const tenantGuids = consumerGroups ?? []
  if (tenantGuids.length > 0) {
    const byTenantAndClientId = await repository.findOne({
      where: { clientId: In(clientIds), tenant: { externalId: In(tenantGuids) } },
      relations: ['tenant'],
    })
    if (byTenantAndClientId) {
      await backfillCredentialIdentifier(repository, byTenantAndClientId, headers, logger)
      return byTenantAndClientId
    }
  }

  const byClientId = await repository.findOne({
    where: { clientId: In(clientIds), credentialIdentifier: IsNull() },
    relations: ['tenant'],
  })
  if (!byClientId) {
    return null
  }

  await backfillCredentialIdentifier(repository, byClientId, headers, logger)

  return byClientId
}

/**
 * Record the credential identifier the gateway just revealed, so subsequent requests
 * resolve on the indexed unique column instead of a clientId match.
 *
 * Best-effort by design: this is a cache warm-up, and failing it must not fail a
 * request that has already authenticated. The realistic failure is the unique
 * constraint firing because another row already claims this identifier, which is
 * worth a warning but not a 500.
 */
async function backfillCredentialIdentifier(
  repository: Repository<ApiKeyConsumer>,
  binding: ApiKeyConsumer,
  headers: GatewayCredentialHeaders,
  logger: Logger,
): Promise<void> {
  const { credentialIdentifier, consumerId } = headers
  const patch: Partial<ApiKeyConsumer> = {}

  if (credentialIdentifier && binding.credentialIdentifier !== credentialIdentifier) {
    patch.credentialIdentifier = credentialIdentifier
  }
  if (consumerId && binding.consumerId !== consumerId) {
    patch.consumerId = consumerId
  }
  if (Object.keys(patch).length === 0) {
    return
  }

  try {
    await repository.update({ id: binding.id }, { ...patch, updatedAt: new Date() })
    Object.assign(binding, patch)
    logger.debug(
      `Backfilled credential identifier for API key ${binding.clientId} (binding ${binding.id})`,
    )
  } catch (error) {
    logger.warn(
      `Could not backfill credential identifier for API key ${binding.clientId}: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
