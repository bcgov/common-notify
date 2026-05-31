import { Injectable, ExecutionContext, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtGuard } from '../../auth/guards/auth.jwt-guard'
import { TenantsService } from '../../api/admin/tenants/tenants.service'
import { ClientTenantMappingService } from '../../api/admin/client-tenant-mappings/client-tenant-mapping.service'
import { CstarApiClient } from '../../services/cstar/cstar-api.client'

/**
 * Tenant Context Guard
 *
 * Extends JwtGuard to add tenant context extraction and validation:
 * 1. Validates JWT through Keycloak's JWKS endpoint (via JwtGuard parent)
 * 2. Extracts and validates tenant context from JWT and headers
 * 3. Attaches tenant and user info to request for downstream use
 *
 * Attaches to request:
 * - request.tenant: The validated tenant entity
 * - request.userGuid: The authenticated user or client ID
 * - request.accessibleTenants: Array of accessible tenant IDs (if multiple)
 * - request.clientId: The JWT azp claim
 *
 * ARCHITECTURAL NOTE:
 * This guard consolidates JWT validation (from Keycloak JWKS) with tenant context extraction.
 * It replaces the previous manual JWT decoding with proper Keycloak JWKS validation
 * via JwtGuard parent class, ensuring both JWT validation and tenant logic work together.
 */
@Injectable()
export class TenantContextGuard extends JwtGuard {
  protected readonly logger = new Logger(TenantContextGuard.name)

  constructor(
    config: ConfigService,
    private tenantsService: TenantsService,
    private clientTenantMappingService: ClientTenantMappingService,
    private cstarApiClient: CstarApiClient,
  ) {
    super(config)
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    // First, validate JWT using parent JwtGuard
    // This validates the JWT signature/issuer through Keycloak JWKS and sets request.user
    const jwtValidated = await super.canActivate(context)
    if (!jwtValidated) {
      return false
    }

    // JWT payload is now available in request.user (populated by JwtGuard)
    const payload = request.user

    const azp = payload.azp as string
    const sub = payload.sub as string
    const xTenantId = request.headers['x-tenant-id'] as string

    // Debug logging to help troubleshoot Kong integration
    this.logger.debug(`TenantContextGuard received:
      - x-tenant-id header: ${xTenantId || '(not provided)'}
      - JWT sub claim: ${sub || '(not provided)'}
      - JWT azp claim: ${azp || '(not provided)'}
      - All headers: ${JSON.stringify(Object.keys(request.headers))}`)

    if (!sub) {
      this.logger.error('JWT missing required "sub" claim')
      throw new UnauthorizedException('JWT missing required "sub" claim')
    }

    try {
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
            `Tenant ${xTenantId} not found or you do not have access.  Please register your clients and tenants with the administrator if you believe this is an error.`,
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
              this.logger.warn(`Error looking up ClientTenantMapping for ${azp}: ${error.message}`)
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
          // REGULAR FRONTEND USER: Optional CSTAR validation for additional security
          // This prevents users from spoofing X-Tenant-ID to access tenants they don't belong to
          // However, CSTAR validation is optional - if CSTAR is unavailable, we trust the JWT
          this.logger.debug(
            `Regular frontend user detected. Attempting CSTAR validation: user=${sub}, tenant=${xTenantId}`,
          )

          try {
            const userTenantIds = await this.cstarApiClient.getUserTenants(sub)
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
            // Don't rethrow CSTAR API errors (401, 404, network failures, etc.)
            // CSTAR is an optional external service - if it's unavailable, we trust the JWT + tenant DB
            // Only rethrow if we explicitly determined the user has NO access
            if (
              error instanceof UnauthorizedException &&
              error.message.includes('do not have access')
            ) {
              throw error
            }

            // CSTAR validation failed (auth error, network, etc.), but we already validated JWT and tenant exists
            // Log a warning and allow the request through
            this.logger.warn(
              `CSTAR validation unavailable for user ${sub}, tenant ${xTenantId}: ${error instanceof Error ? error.message : String(error)}. Allowing request based on JWT validation.`,
            )
          }
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
      // If this is an intentional 401 from this guard, just rethrow without extra logging
      if (error instanceof UnauthorizedException) {
        throw error
      }

      // For other errors, log and throw
      this.logger.error(
        `Failed to extract tenant context: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw error
    }
  }
}
