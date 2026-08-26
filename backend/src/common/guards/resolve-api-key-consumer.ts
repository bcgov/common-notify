import { Logger } from '@nestjs/common'
import { In, Repository } from 'typeorm'
import { ApiKeyConsumer } from '../../api/api-keys/entities/api-key-consumer.entity'

/** The gateway-injected headers that identify the caller's credential. */
export interface GatewayCredentialHeaders {
  credentialIdentifier?: string
  consumerUsername?: string
  consumerCustomId?: string
  consumerId?: string
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
  }
}

/** True when the gateway gave us nothing to identify the credential with. */
export function hasNoCredentialHeaders(headers: GatewayCredentialHeaders): boolean {
  return !headers.credentialIdentifier && !headers.consumerUsername && !headers.consumerCustomId
}

/**
 * Resolve the tenant binding for a gateway-authenticated request.
 *
 * Two lookups, because the two ways of creating a binding know different things:
 *
 *  1. `x-credential-identifier` → `credential_identifier`. The fast path, and the
 *     only path for keys bound through POST /api/v1/service/api-key/bind.
 *  2. `x-consumer-username` / `x-consumer-custom-id` → `client_id`. Keys Notify
 *     issued itself have no credential identifier on file: the APS Credential Issuer
 *     API returns the clientId but not Kong's per-credential ID. On a hit here the
 *     credential identifier is backfilled so every later request takes path 1.
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
): Promise<ApiKeyConsumer | null> {
  const { credentialIdentifier, consumerUsername, consumerCustomId, consumerId } = headers

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

  const byClientId = await repository.findOne({
    where: { clientId: In(clientIds) },
    relations: ['tenant'],
  })
  if (!byClientId) {
    return null
  }

  await backfillCredentialIdentifier(
    repository,
    byClientId,
    credentialIdentifier,
    consumerId,
    logger,
  )

  return byClientId
}

/**
 * Record the credential identifier the gateway just revealed, so subsequent requests
 * resolve on the indexed unique column instead of the clientId fallback.
 *
 * Best-effort by design: this is a cache warm-up, and failing it must not fail a
 * request that has already authenticated. The realistic failure is the unique
 * constraint firing because another row already claims this identifier, which is
 * worth a warning but not a 500.
 */
async function backfillCredentialIdentifier(
  repository: Repository<ApiKeyConsumer>,
  binding: ApiKeyConsumer,
  credentialIdentifier: string | undefined,
  consumerId: string | undefined,
  logger: Logger,
): Promise<void> {
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
