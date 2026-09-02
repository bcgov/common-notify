import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Tenant } from '../../api/admin/tenants/entities/tenant.entity'
import { ApiKeyConsumer } from '../../api/api-keys/entities/api-key-consumer.entity'
import {
  hasNoCredentialHeaders,
  readGatewayCredentialHeaders,
  resolveApiKeyConsumer,
} from './resolve-api-key-consumer'

/**
 * NotifyServiceGuard
 *
 * Guard for service-to-service API calls using API keys validated by Kong.
 *
 * **How it works:**
 * 1. Kong's key-auth plugin validates the API key (sent in X-API-KEY header)
 * 2. Only valid requests reach the backend (Kong blocks invalid keys)
 * 3. Kong passes the credential's identity along as x-credential-identifier and
 *    x-consumer-username
 * 4. Backend resolves the api_key_consumer binding from those headers
 *    (see resolve-api-key-consumer.ts for why both are needed)
 * 5. Backend resolves the tenant from the binding and attaches it to the request
 *
 * **Key Design Decision:**
 * We never store or validate raw API key values in the database.
 * Kong is the source of truth for key validity via the key-auth plugin.
 * Tenant resolution uses the stable identifiers from the mapping table, created
 * either by the self-service issue endpoint or by POST /api/v1/service/api-key/bind.
 *
 * Error responses:
 * - 401: Kong did not identify the credential (request not authenticated by Kong)
 * - 404: No binding found for the credential; key must be bound to a tenant first
 *
 * Usage:
 * @UseGuards(NotifyServiceGuard)
 * async serviceEndpoint() { }
 */
@Injectable()
export class NotifyServiceGuard implements CanActivate {
  private readonly logger = new Logger(NotifyServiceGuard.name)

  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(ApiKeyConsumer)
    private apiKeyConsumerRepository: Repository<ApiKeyConsumer>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

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
        `Failed to look up api_key_consumer for credential ${credentialIdentifier}: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw new UnauthorizedException('Failed to validate request')
    }

    if (!mapping) {
      this.logger.warn(
        `No tenant binding found for credential identifier ${credentialIdentifier}. ` +
          `The API key must be issued from the Notify UI, or bound via POST /api/v1/service/api-key/bind`,
      )
      throw new NotFoundException(
        'This API key has not been associated with a tenant. ' +
          'Request a key from the Notify UI, or call POST /api/v1/service/api-key/bind to complete setup.',
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
    request.credentialIdentifier = credentialIdentifier ?? mapping.credentialIdentifier

    this.logger.debug(
      `✓ Service-to-service request authorized. Tenant: "${tenant.name}" (${tenant.id})`,
    )

    return true
  }
}
