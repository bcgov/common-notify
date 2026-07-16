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

/**
 * NotifyServiceGuard
 *
 * Guard for service-to-service API calls using API keys validated by Kong.
 *
 * **How it works:**
 * 1. Kong's key-auth plugin validates the API key (sent in X-API-KEY header)
 * 2. Only valid requests reach the backend (Kong blocks invalid keys)
 * 3. Kong passes the per-key credential ID in x-credential-identifier header
 * 4. Backend looks up the api_key_consumer mapping by credential identifier
 * 5. Backend resolves the tenant from the mapping and attaches it to the request
 *
 * **Flow:**
 * Request → Kong key-auth validates X-API-KEY → Kong adds x-credential-identifier header
 *         → Backend reads x-credential-identifier → Looks up api_key_consumer mapping
 *         → Resolves tenant → Attaches tenant context to request
 *
 * **Key Design Decision:**
 * We never store or validate raw API key values in the database.
 * Kong is the source of truth for key validity via the key-auth plugin.
 * Tenant resolution uses the stable per-key credential identifier from the mapping
 * table, created by the bind endpoint (POST /api/v1/service/api-key/bind).
 *
 * Error responses:
 * - 401: Kong did not pass x-credential-identifier (request not authenticated by Kong)
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

    // Kong's key-auth plugin passes the per-key credential ID in this header.
    // This header is only present if Kong successfully validated an API key.
    const credentialIdentifier = request.headers['x-credential-identifier'] as string
    if (!credentialIdentifier) {
      this.logger.warn(
        'Request missing x-credential-identifier header. Kong did not authenticate the API key.',
      )
      throw new UnauthorizedException('API request must be authenticated with a valid API key')
    }

    let mapping: ApiKeyConsumer | null = null
    try {
      mapping = await this.apiKeyConsumerRepository.findOne({
        where: { credentialIdentifier },
        relations: ['tenant'],
      })
    } catch (error) {
      this.logger.error(
        `Failed to look up api_key_consumer for credential ${credentialIdentifier}: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw new UnauthorizedException('Failed to validate request')
    }

    if (!mapping) {
      this.logger.warn(
        `No tenant binding found for credential identifier ${credentialIdentifier}. ` +
          `The API key must be bound to a tenant via POST /api/v1/service/api-key/bind`,
      )
      throw new NotFoundException(
        'This API key has not been associated with a tenant. ' +
          'Please call POST /api/v1/service/api-key/bind to complete setup.',
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
    request.credentialIdentifier = credentialIdentifier

    this.logger.debug(
      `✓ Service-to-service request authorized. Tenant: "${tenant.name}" (${tenant.id})`,
    )

    return true
  }
}
