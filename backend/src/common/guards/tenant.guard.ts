import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { TenantsService } from '../../admin/tenants/tenants.service'

/**
 * Guard that extracts tenant information from JWT or Kong headers
 *
 * Kong adds these headers after successful authentication:
 * - X-Consumer-Username: The authenticated consumer's username
 * - X-Consumer-ID: Kong's internal UUID for the consumer
 * - X-Credential-ID: The specific API key credential ID
 *
 * JWT authentication via Keycloak includes:
 * - Authorization: Bearer <JWT token>
 *
 * Attaches the tenant to request.tenant for use in route handlers.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name)

  constructor(private tenantsService: TenantsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    // First, try to get tenant from Kong headers
    const kongUsername = request.headers['x-consumer-username']
    const kongConsumerId = request.headers['x-consumer-id']

    if (kongUsername) {
      this.logger.log(
        `Kong authentication detected: username="${kongUsername}", consumerId="${kongConsumerId}"`,
      )

      const tenant = await this.tenantsService.findByKongUsername(kongUsername as string)
      if (!tenant) {
        this.logger.error(`Tenant lookup failed for Kong username: ${kongUsername}`)
        throw new BadRequestException(`Tenant not found for Kong username: ${kongUsername}`)
      }

      this.logger.log(
        `Tenant authenticated via Kong: ${tenant.name} (DB ID: ${tenant.id}, Kong ID: ${kongConsumerId})`,
      )

      request.tenant = tenant
      request.kongConsumerId = kongConsumerId
      return true
    }

    // If no Kong headers, try JWT from Authorization header
    const authHeader = request.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      this.logger.log('JWT authentication detected')

      try {
        // Decode JWT manually - split by '.' and decode the payload (middle part)
        const parts = token.split('.')
        if (parts.length !== 3) {
          throw new Error('Invalid JWT format')
        }

        // Decode the payload (second part)
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'))

        this.logger.log(`JWT Payload: ${JSON.stringify(payload, null, 2)}`)

        // Extract tenant identifier from JWT claims
        // The 'sub' claim contains the OAuth2 client ID (e.g., "test-client-a")
        const clientId = payload.sub as string
        if (!clientId) {
          throw new Error('JWT missing required "sub" claim')
        }

        this.logger.log(`JWT client_id from 'sub' claim: ${clientId}`)

        // Look up tenant by OAuth2 client ID
        const tenant = await this.tenantsService.findByOAuth2ClientId(clientId).catch(() => null)

        if (!tenant) {
          this.logger.error(
            `Tenant not found for OAuth2 client_id "${clientId}". Ensure tenant is registered in database.`,
          )
          throw new UnauthorizedException(
            `Tenant not found for OAuth2 client_id: ${clientId}. Please create the tenant first.`,
          )
        }

        this.logger.log(`Tenant authenticated via JWT: ${tenant.name} (Client ID: ${clientId})`)

        request.tenant = tenant
        request.clientId = clientId
        return true
      } catch (error) {
        this.logger.error(`Failed to process JWT: ${error.message}`)
        throw new UnauthorizedException(`Invalid JWT token: ${error.message}`)
      }
    }

    // No authentication found
    this.logger.error('No authentication headers found (Kong or JWT)')
    throw new BadRequestException(
      'Missing authentication. Provide either Kong consumer headers or JWT token.',
    )
  }
}
