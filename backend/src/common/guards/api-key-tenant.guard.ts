import {
  CanActivate,
  ExecutionContext,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { Repository } from 'typeorm'
import { ApiKeyConsumer } from '../../api/api-keys/entities/api-key-consumer.entity'
import {
  hasNoCredentialHeaders,
  readGatewayCredentialHeaders,
  resolveApiKeyConsumer,
} from './resolve-api-key-consumer'

/**
 * Shared tenant resolution for service-to-service routes authenticated by an API key.
 *
 * **How it works:**
 * 1. Kong's key-auth plugin validates the API key (sent in X-API-KEY header)
 * 2. Only valid requests reach the backend (Kong blocks invalid keys)
 * 3. Kong passes the credential's identity along as x-credential-identifier,
 *    x-consumer-username and the consumer's ACL groups
 * 4. Backend resolves the api_key_consumer binding from those headers
 *    (see resolve-api-key-consumer.ts for why more than one is needed)
 * 5. Backend resolves the tenant from the binding and attaches it to the request
 *
 * **Key design decision:**
 * We never store or validate raw API key values in the database. Kong is the source of
 * truth for key validity. Tenant resolution uses the stable identifiers in the mapping
 * table, written when Notify issues a key.
 *
 * Error responses:
 * - 401: Kong did not identify the credential (request not authenticated by Kong)
 * - 404: No binding found for the credential; key must be bound to a tenant first
 *
 * Subclasses exist for protocol differences only — see {@link beforeResolve}.
 */
export abstract class ApiKeyTenantGuard implements CanActivate {
  protected abstract readonly logger: Logger

  constructor(protected readonly apiKeyConsumerRepository: Repository<ApiKeyConsumer>) {}

  /**
   * Checked before any tenant lookup, for a route whose clients authenticate in a shape
   * of their own. Throw to reject. The default accepts everything.
   */
  protected beforeResolve(_request: { headers: Record<string, unknown> }): void {}

  /** Names this guard in its success log, e.g. "GC Notify request authorized". */
  protected abstract get routeDescription(): string

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    this.beforeResolve(request)

    // Kong's key-auth plugin injects these only after it has validated an API key.
    const credentialHeaders = readGatewayCredentialHeaders(request.headers)
    if (hasNoCredentialHeaders(credentialHeaders)) {
      this.logger.warn(
        'Request carries no gateway credential headers. Kong did not authenticate the API key.',
      )
      throw new UnauthorizedException('API request must be authenticated with a valid API key')
    }

    const credentialIdentifier = credentialHeaders.credentialIdentifier

    let mapping: ApiKeyConsumer | null = null
    try {
      mapping = await resolveApiKeyConsumer(
        this.apiKeyConsumerRepository,
        credentialHeaders,
        this.logger,
        request.headers,
      )
    } catch (error) {
      this.logger.error(
        `Failed to look up api_key_consumer for credential ${credentialIdentifier}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      )
      throw new UnauthorizedException('Failed to validate request')
    }

    if (!mapping) {
      this.logger.warn(
        `No tenant binding found for credential identifier ${credentialIdentifier}. ` +
          `The API key must be issued from the Notify UI`,
      )
      throw new NotFoundException(
        'This API key has not been associated with a tenant. ' +
          'Request a key from the Notify UI to complete setup.',
      )
    }

    const tenant = mapping.tenant
    if (!tenant || tenant.isDeleted) {
      this.logger.warn(
        `Tenant ${mapping.tenantId} for credential ${credentialIdentifier} not found or is deleted`,
      )
      throw new NotFoundException('Associated tenant not found or has been deactivated')
    }

    // Attach tenant context to request for downstream handlers
    request.tenant = tenant
    request.tenantId = tenant.id
    request.tenantExternalId = tenant.externalId
    // The bound API key (api_key_consumer) that authenticated this request.
    // Used downstream to attribute notification usage against the key's limits.
    request.apiKeyConsumerId = mapping.id

    this.logger.debug(
      `✓ ${this.routeDescription} authorized. Tenant: "${tenant.name}" (${tenant.id})`,
    )

    return true
  }
}
