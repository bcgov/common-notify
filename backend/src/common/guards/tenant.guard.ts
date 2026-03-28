import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { TenantsService } from '../../admin/tenants/tenants.service'

/**
 * Guard that extracts the Kong consumer username from headers
 * and looks up the corresponding Tenant in the database.
 * Attaches the tenant to request.tenant for use in route handlers.
 *
 * Kong adds these headers after successful authentication:
 * - X-Consumer-Username: The authenticated consumer's username
 * - X-Consumer-ID: Kong's internal UUID for the consumer
 * - X-Credential-ID: The specific API key credential ID
 *
 * Used in protected routes that require Kong authentication.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name)

  constructor(private tenantsService: TenantsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    // Log all Kong headers that were added by the API gateway
    const kongHeaders = {
      'x-consumer-username': request.headers['x-consumer-username'],
      'x-consumer-id': request.headers['x-consumer-id'],
      'x-credential-id': request.headers['x-credential-id'],
    }

    this.logger.debug(
      `Kong headers received: ${JSON.stringify(kongHeaders)}`,
      'TenantGuard.canActivate',
    )

    const kongUsername = request.headers['x-consumer-username']
    const kongConsumerId = request.headers['x-consumer-id']

    if (!kongUsername) {
      this.logger.error('Kong authentication failed: X-Consumer-Username header missing')
      throw new BadRequestException(
        'X-Consumer-Username header is missing. This endpoint requires Kong authentication.',
      )
    }

    this.logger.log(
      `Authenticating Kong consumer: username="${kongUsername}", consumerId="${kongConsumerId}"`,
    )

    const tenant = await this.tenantsService.findByKongUsername(kongUsername as string)
    if (!tenant) {
      this.logger.error(`Tenant lookup failed for Kong username: ${kongUsername}`)
      throw new BadRequestException(`Tenant not found for Kong username: ${kongUsername}`)
    }

    this.logger.log(
      `Tenant authenticated: ${tenant.name} (DB ID: ${tenant.id}, Kong ID: ${kongConsumerId})`,
    )

    // Attach tenant and Kong consumer ID to request object for use in route handlers
    request.tenant = tenant
    request.kongConsumerId = kongConsumerId

    return true
  }
}
