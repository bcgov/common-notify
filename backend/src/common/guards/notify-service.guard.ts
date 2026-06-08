import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { ApiKey } from '../../api/admin/api-keys/entities/api-key.entity'
import { Tenant } from '../../api/admin/tenants/entities/tenant.entity'

/**
 * NotifyServiceGuard
 *
 * Guard for service-to-service API calls using API keys validated by Kong.
 *
 * **How it works:**
 * 1. Kong's key-auth plugin validates the API key
 * 2. Only valid requests reach the backend (Kong blocks invalid keys)
 * 3. Kong passes the consumer ID in X-Consumer-ID header
 * 4. Backend looks up the consumer ID to find which tenant/API key was used
 * 5. Backend attaches tenant context to the request
 *
 * **Flow:**
 * Request → Kong key-auth plugin validates → Kong adds X-Consumer-ID header
 *         → Backend reads X-Consumer-ID → Looks up in api_key table
 *         → Checks revocation status → Attaches tenant to request
 *
 * **Key Design Decision:**
 * We don't store or validate the actual API key value in the database.
 * Kong is the source of truth for key validity via the key-auth plugin.
 * We only store references (Kong consumer ID, Kong key ID) for tracking and revocation.
 *
 * Error responses:
 * - 401: Kong didn't pass X-Consumer-ID header (request wasn't authenticated by Kong)
 * - 404: Consumer ID doesn't exist in api_key table or associated tenant not found
 *
 * Usage:
 * @UseGuards(NotifyServiceGuard)
 * async serviceEndpoint() { }
 */
@Injectable()
export class NotifyServiceGuard implements CanActivate {
  private readonly logger = new Logger(NotifyServiceGuard.name)

  constructor(
    @InjectRepository(ApiKey)
    private apiKeyRepository: Repository<ApiKey>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    // Kong's key-auth plugin passes the consumer UUID in this header
    // This header is only present if Kong successfully validated an API key
    const consumerId = request.headers['x-consumer-id'] as string
    if (!consumerId) {
      this.logger.warn(
        'Request missing X-Consumer-ID header. Kong did not authenticate the API key.',
      )
      throw new UnauthorizedException('API request must be authenticated with a valid API key')
    }

    // Look up the API key by Kong consumer ID
    let apiKey: ApiKey | null = null
    try {
      apiKey = await this.apiKeyRepository.findOne({
        where: { kongConsumerId: consumerId, revokedAt: IsNull() },
        relations: ['tenant'],
      })
    } catch (error) {
      this.logger.error(
        `Failed to look up API key for consumer ${consumerId}: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw new UnauthorizedException('Failed to validate request')
    }

    if (!apiKey) {
      this.logger.warn(`No API key found for Kong consumer ${consumerId}`)
      throw new NotFoundException('API key record not found')
    }

    // Check if the key has been revoked
    if (apiKey.revokedAt) {
      this.logger.warn(`Attempt to use revoked API key ${apiKey.id} (consumer: ${consumerId})`)
      throw new UnauthorizedException('This API key has been revoked')
    }

    // Verify the associated tenant exists
    if (!apiKey.tenant) {
      this.logger.error(
        `API key ${apiKey.id} has invalid tenant reference (tenant_id: ${apiKey.tenantId})`,
      )
      throw new NotFoundException('Associated tenant not found')
    }

    // Update usage statistics (non-blocking)
    // If this fails, we still allow the request through
    try {
      await this.apiKeyRepository.update(apiKey.id, {
        usageCount: apiKey.usageCount + 1,
        lastUsedAt: new Date(),
      })
    } catch (error) {
      this.logger.warn(
        `Failed to update API key usage stats: ${error instanceof Error ? error.message : String(error)}`,
      )
      // Silently continue - usage tracking is not critical to request validation
    }

    // Attach tenant and API key context to request for downstream handlers
    request.tenant = apiKey.tenant
    request.apiKey = apiKey
    request.tenantId = apiKey.tenantId

    this.logger.debug(
      `✓ Service-to-service request authorized. Key: "${apiKey.displayName}", Tenant: "${apiKey.tenant.name}"`,
    )

    return true
  }
}
