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
import { CstarApiClient } from '../../services/cstar/cstar-api.client'

/**
 * Guard that extracts tenant information from JWT
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
    private cstarApiClient: CstarApiClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    // Try to get tenant from JWT in Authorization header
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
              `Tenant ${xTenantId} not found or you do not have access.  Please register your clients and tennants with the administrator if you believe this is an error.`,
            )
          }

          // If this is a service client (azp === sub), verify the mapping is active
          // For regular frontend users, sub will be different from azp (sub is user GUID)
          if (azp && azp === sub) {
            this.logger.debug(
              `Service client detected (azp === sub). Verifying mapping: azp=${azp}, tenantId=${tenant.id}`,
            )

            const activeTenantIds = await this.clientTenantMappingService
              .findTenantsByClientId(azp)
              .catch((error) => {
                this.logger.warn(
                  `Error looking up ClientTenantMapping for ${azp}: ${error.message}`,
                )
                return []
              })

            const mappingIsActive = activeTenantIds.includes(tenant.id)
            if (!mappingIsActive) {
              this.logger.error(
                `Service client ${azp} does not have an active mapping for tenant ${tenant.id} (CSTAR ID: ${xTenantId})`,
              )
              throw new UnauthorizedException(
                `Client is not authorized to access this tenant. The mapping may be inactive.`,
              )
            }

            this.logger.debug(
              `Service client ${azp} mapping verified as active for tenant ${tenant.id}`,
            )
          } else {
            // REGULAR FRONTEND USER: Validate user has access to tenant via CSTAR
            // This prevents users from spoofing X-Tenant-ID to access tenants they don't belong to
            this.logger.debug(
              `Regular frontend user detected. Validating CSTAR access: user=${sub}, tenant=${xTenantId}`,
            )

            try {
              // Extract user ID from JWT idir_user_guid claim and normalize for CSTAR API
              const normalizedUserId = ((payload.idir_user_guid as string) || '').toUpperCase()
              const userTenantIds = await this.cstarApiClient.getUserTenants(
                normalizedUserId,
                authHeader,
              )
              const hasAccess = userTenantIds.includes(xTenantId)

              if (!hasAccess) {
                this.logger.warn(
                  `User ${sub} requested tenant ${xTenantId} but does not have access. User has access to: [${userTenantIds.join(', ')}]`,
                )
                throw new UnauthorizedException(
                  `You do not have access to tenant ${xTenantId}. Verify the tenant ID and try again.`,
                )
              }

              this.logger.debug(`User ${sub} verified as having access to tenant ${xTenantId}`)
            } catch (error) {
              if (error instanceof UnauthorizedException) {
                throw error
              }

              this.logger.error(
                `Error validating user tenant access: ${error instanceof Error ? error.message : String(error)}`,
              )
              throw new UnauthorizedException(`Failed to verify tenant access. Please try again.`)
            }
          }

          this.logger.debug(
            `Tenant authenticated via X-Tenant-ID header: ${tenant.name} (DB ID: ${tenant.id}, CSTAR ID: ${xTenantId})`,
          )

          request.tenant = tenant
          request.user = payload
          request.userGuid = sub

          this.logger.debug(
            `TenantGuard: Set request.tenant for frontend user ${sub} with X-Tenant-ID: ${JSON.stringify(
              {
                tenantId: request.tenant?.id,
                tenantName: request.tenant?.name,
              },
            )}`,
          )

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
          const tenants = (
            await Promise.all(tenantIds.map((id) => this.tenantsService.findOne(id))).catch(
              (error) => {
                this.logger.error(`Failed to fetch tenant details: ${error.message}`)
                throw new UnauthorizedException('Failed to resolve authorized tenants')
              },
            )
          ).filter((t) => t !== null)

          if (tenants.length === 0) {
            this.logger.error(
              `Client ${azp} has tenant mappings but none of the mapped tenants exist in the database. Mapped IDs: ${tenantIds.join(', ')}`,
            )
            throw new UnauthorizedException(
              'Tenant records not found. Please contact an administrator.',
            )
          }

          // Use first tenant as primary (can be overridden by route-specific logic)
          request.tenant = tenants[0]
          request.user = payload
          request.accessibleTenants = tenants
          request.clientId = azp

          this.logger.debug(
            `TenantGuard: Set request.tenant for service client ${azp}: ${JSON.stringify({
              tenantId: request.tenant?.id,
              tenantName: request.tenant?.name,
            })}`,
          )

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
        request.user = payload
        request.userGuid = sub

        this.logger.debug(
          `TenantGuard: Set request.tenant for regular user ${sub}: ${JSON.stringify({
            tenantId: request.tenant?.id,
            tenantName: request.tenant?.name,
          })}`,
        )

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
