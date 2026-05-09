import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { TenantsService } from '../../api/admin/tenants/tenants.service'
import { ClientTenantMappingService } from '../../api/admin/client-tenant-mappings/client-tenant-mapping.service'

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
 * - For service clients (client credentials flow): client_id in 'sub' or 'azp' claim
 * - For frontend users: user GUID in 'sub' claim
 *
 * Service clients are resolved to their accessible tenants via ClientTenantMapping.
 *
 * Attaches the tenant to request.tenant for use in route handlers.
 * Also attaches request.accessibleTenants array for multi-tenant scenarios.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name)

  constructor(
    private tenantsService: TenantsService,
    private clientTenantMappingService: ClientTenantMappingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    // First, try to get tenant from Kong headers (if Kong is in use)
    const kongUsername = request.headers['x-consumer-username']
    const kongConsumerId = request.headers['x-consumer-id']

    this.logger.debug(
      `Incoming request: method=${request.method}, url=${request.url}, KongUsername=${kongUsername}, KongConsumerId=${kongConsumerId}`,
    )

    if (kongUsername) {
      this.logger.debug(
        `Kong authentication detected: username="${kongUsername}", consumerId="${kongConsumerId}"`,
      )

      // Kong X-Consumer-Username is the OAuth2 client ID (from API Gateway)
      // Look up which tenant(s) this client is mapped to
      if (!kongUsername) {
        this.logger.error('Kong authentication present but missing X-Consumer-Username header')
        throw new UnauthorizedException('Missing client ID in Kong headers')
      }

      const clientId = kongUsername as string
      const tenantIds = await this.clientTenantMappingService
        .findTenantsByClientId(clientId)
        .catch((error) => {
          this.logger.warn(
            `Error looking up ClientTenantMapping for Kong client ${clientId}: ${error.message}`,
          )
          return []
        })

      if (tenantIds.length === 0) {
        this.logger.error(
          `Kong client ${clientId} (${kongUsername}) has no mapped tenants in ClientTenantMapping table. Register via link-client-to-tenants endpoint.`,
        )
        throw new UnauthorizedException(
          `Client is not authorized to access any tenants. Please register this client via the admin API.`,
        )
      }

      this.logger.debug(
        `Kong client ${clientId} is authorized for ${tenantIds.length} tenant(s): ${tenantIds.join(', ')}`,
      )

      // Fetch the tenant objects
      const tenants = await Promise.all(
        tenantIds.map((id) => this.tenantsService.findOne(id)),
      ).catch((error) => {
        this.logger.error(`Failed to fetch tenant details: ${error.message}`)
        throw new UnauthorizedException('Failed to resolve authorized tenants')
      })

      // Use first tenant as primary (can be overridden by route-specific logic)
      request.tenant = tenants[0]
      request.accessibleTenants = tenants
      request.clientId = clientId
      request.kongUsername = kongUsername

      this.logger.debug(
        `Tenant authenticated via Kong client: ${tenants[0].name} (DB ID: ${tenants[0].id}, Kong Client ID: ${clientId})`,
      )

      return true
    }

    // If no Kong headers, try JWT from Authorization header
    const authHeader = request.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      this.logger.debug('JWT authentication detected')

      try {
        // Decode JWT manually - split by '.' and decode the payload (middle part)
        const parts = token.split('.')
        if (parts.length !== 3) {
          throw new Error('Invalid JWT format')
        }

        // Decode the payload (second part)
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'))

        this.logger.debug(`JWT Payload: ${JSON.stringify(payload, null, 2)}`)

        const azp = payload.azp as string
        const sub = payload.sub as string
        const xTenantId = request.headers['x-tenant-id'] as string

        if (!sub) {
          throw new Error('JWT missing required "sub" claim')
        }

        // FRONTEND USER PATH: Has X-Tenant-ID header (user selected a tenant from CSTAR)
        // This takes priority - frontend requests should not use azp for ClientTenantMapping
        if (xTenantId) {
          this.logger.debug(
            `Frontend user JWT with tenant selection. User sub: ${sub}, X-Tenant-ID: ${xTenantId}`,
          )

          // Look up tenant by external ID (CSTAR tenant GUID stored in tenants.external_id)
          const tenant = await this.tenantsService.findByExternalId(xTenantId).catch(() => null)

          if (!tenant) {
            this.logger.error(
              `Tenant not found for CSTAR ID: ${xTenantId}. User ${sub} may not have access to this tenant.`,
            )
            throw new UnauthorizedException(
              `Tenant ${xTenantId} not found or you do not have access.`,
            )
          }

          this.logger.debug(
            `Tenant authenticated via X-Tenant-ID header: ${tenant.name} (DB ID: ${tenant.id}, CSTAR ID: ${xTenantId})`,
          )

          request.tenant = tenant
          request.userGuid = sub
          return true
        }

        // SERVICE CLIENT PATH: No X-Tenant-ID header, uses azp for ClientTenantMapping
        if (azp) {
          this.logger.debug(`Service client JWT detected. Client ID (azp): ${azp}`)

          // Look up accessible tenants via ClientTenantMapping
          const tenantIds = await this.clientTenantMappingService
            .findTenantsByClientId(azp)
            .catch((error) => {
              this.logger.warn(`Error looking up ClientTenantMapping for ${azp}: ${error.message}`)
              return []
            })

          if (tenantIds.length === 0) {
            this.logger.warn(`Client ${azp} has no mapped tenants in ClientTenantMapping table`)
            throw new UnauthorizedException(
              `Client ${azp} is not authorized to access any tenants. Please contact an administrator.`,
            )
          }

          this.logger.debug(
            `Client ${azp} is authorized for ${tenantIds.length} tenant(s): ${tenantIds.join(', ')}`,
          )

          // Fetch the tenant objects
          const tenants = await Promise.all(
            tenantIds.map((id) => this.tenantsService.findOne(id)),
          ).catch((error) => {
            this.logger.error(`Failed to fetch tenant details: ${error.message}`)
            throw new UnauthorizedException('Failed to resolve authorized tenants')
          })

          // Use first tenant as primary (can be overridden by route-specific logic)
          request.tenant = tenants[0]
          request.accessibleTenants = tenants
          request.clientId = azp
          return true
        }

        // REGULAR USER PATH: No X-Tenant-ID header, no azp claim - look up user by externalId (sub claim)
        // This is for regular frontend users who authenticate with JWT but don't have a selected tenant yet
        this.logger.debug(
          `Regular user JWT (no X-Tenant-ID, no azp). Looking up user by externalId: ${sub}`,
        )

        const tenant = await this.tenantsService.findByExternalId(sub).catch((error) => {
          this.logger.warn(`Error looking up tenant by externalId ${sub}: ${error.message}`)
          return null
        })

        if (!tenant) {
          this.logger.error(
            `No tenant found for user externalId: ${sub}. User may not have been registered.`,
          )
          throw new UnauthorizedException(
            `No tenant found for user. Please contact an administrator.`,
          )
        }

        this.logger.debug(
          `Regular user authenticated via externalId lookup: ${tenant.name} (DB ID: ${tenant.id})`,
        )

        request.tenant = tenant
        request.userGuid = sub
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
