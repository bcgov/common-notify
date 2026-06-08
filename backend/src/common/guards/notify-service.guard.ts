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

/**
 * NotifyServiceGuard
 *
 * Guard for service-to-service API calls using API keys validated by Kong.
 *
 * **How it works:**
 * 1. Kong's key-auth plugin validates the API key
 * 2. Only valid requests reach the backend (Kong blocks invalid keys)
 * 3. Kong passes the consumer custom ID in X-Consumer-Custom-ID header
 * 4. Backend resolves tenant by matching tenant.external_id to the consumer custom ID
 * 5. Backend attaches tenant context to the request
 *
 * **Flow:**
 * Request → Kong key-auth plugin validates → Kong adds X-Consumer-Custom-ID header
 *         → Backend reads X-Consumer-Custom-ID → Looks up tenant by external_id
 *         → Attaches tenant to request
 *
 * **Key Design Decision:**
 * We don't store or validate API key values in the database.
 * Kong is the source of truth for key validity via the key-auth plugin.
 * Tenant mapping is done by Kong consumer custom_id -> tenant.external_id.
 *
 * Error responses:
 * - 401: Kong didn't pass X-Consumer-Custom-ID header (request wasn't authenticated by Kong)
 * - 404: No tenant matches the provided consumer custom ID
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
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    // Kong's key-auth plugin passes the consumer custom ID in this header
    // This header is only present if Kong successfully validated an API key
    const externalTenantId = request.headers['x-consumer-custom-id'] as string
    if (!externalTenantId) {
      this.logger.warn(
        'Request missing X-Consumer-Custom-ID header. Kong did not authenticate the API key.',
      )
      throw new UnauthorizedException('API request must be authenticated with a valid API key')
    }

    let tenant: Tenant | null = null
    try {
      tenant = await this.tenantRepository.findOne({
        where: { externalId: externalTenantId, isDeleted: false },
      })
    } catch (error) {
      this.logger.error(
        `Failed to look up tenant for external id ${externalTenantId}: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw new UnauthorizedException('Failed to validate request')
    }

    if (!tenant) {
      this.logger.warn(`No tenant found for Kong consumer custom id ${externalTenantId}`)
      throw new NotFoundException('Associated tenant not found')
    }

    // Attach tenant context to request for downstream handlers
    request.tenant = tenant
    request.tenantId = tenant.id
    request.tenantExternalId = externalTenantId

    this.logger.debug(
      `✓ Service-to-service request authorized. Tenant: "${tenant.name}" (${externalTenantId})`,
    )

    return true
  }
}
