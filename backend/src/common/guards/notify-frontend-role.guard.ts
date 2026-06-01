import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { JwtGuard } from '../../auth/guards/auth.jwt-guard'
import { TenantsService } from '../../api/admin/tenants/tenants.service'
import { ClientTenantMappingService } from '../../api/admin/client-tenant-mappings/client-tenant-mapping.service'
import { CstarApiClient } from '../../services/cstar/cstar-api.client'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { SsoRole } from '../../enum/sso-role.enum'

/**
 * NotifyFrontendRoleGuard
 *
 * Guard for frontend routes that require both authentication and authorization.
 *
 * Validation flow:
 * 1. Validates JWT signature via Keycloak JWKS (via JwtGuard parent)
 * 2. Validates client ID matches configured KEYCLOAK_CLIENT_ID (azp claim)
 * 3. Validates JWT issuer matches KEYCLOAK_ISSUER
 * 4. Requires x-tenant-id header (user's selected tenant from frontend)
 * 5. Validates user has access to tenant via CSTAR API
 * 6. Validates client_id + tenant_id mapping exists in database
 * 7. Validates user role based on role source:
 *    - SSO roles (NOTIFY_ADMIN, NOTIFY_USER): Validated from JWT payload
 *    - CSTAR roles (NOTIFY_VIEWER, NOTIFY_TEMPLATE_EDITOR, etc.): Validated via CSTAR API
 *
 * Attaches to request:
 * - request.tenant: The tenant entity
 * - request.userGuid: The authenticated user's ID (sub claim)
 * - request.clientId: The application client ID (azp claim)
 *
 * Role Validation Strategy:
 * - Admin functionality (feature flags, client mappings): Use @Roles(SsoRole.NOTIFY_ADMIN)
 *   - Validates against Keycloak JWT roles (fast, doesn't require CSTAR)
 * - Regular functionality (templates, notifications): Use @Roles(CstarRole.NOTIFY_*)
 *   - Validates against CSTAR API roles (tenant-specific access control)
 *
 * Usage:
 * @UseGuards(NotifyFrontendRoleGuard)
 * @Roles(SsoRole.NOTIFY_ADMIN)  // Check JWT for admin role
 * admin() { }
 *
 * @UseGuards(NotifyFrontendRoleGuard)
 * @Roles(CstarRole.NOTIFY_VIEWER)  // Check CSTAR for viewer role
 * list() { }
 */
@Injectable()
export class NotifyFrontendRoleGuard extends JwtGuard {
  protected readonly logger = new Logger(NotifyFrontendRoleGuard.name)
  private readonly keycloakClientId: string
  private readonly keycloakIssuer: string

  constructor(
    reflector: Reflector,
    configService: ConfigService,
    private tenantsService: TenantsService,
    private clientTenantMappingService: ClientTenantMappingService,
    private cstarApiClient: CstarApiClient,
  ) {
    super(reflector)
    this.keycloakClientId = configService.getOrThrow('auth.notifyClientId')
    this.keycloakIssuer = configService.getOrThrow('auth.frontendKeycloakIssuer')
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    // 1. Validate JWT signature via parent JwtGuard
    const jwtValidated = await super.canActivate(context)
    if (!jwtValidated) {
      return false
    }

    const payload = request.user
    const azp = payload.azp as string
    const sub = payload.sub as string
    const iss = payload.iss as string
    const xTenantId = request.headers['x-tenant-id'] as string

    // 2. Validate client ID (azp claim must match KEYCLOAK_CLIENT_ID)
    if (azp !== this.keycloakClientId) {
      this.logger.warn(`Client ID mismatch. Expected: ${this.keycloakClientId}, Got: ${azp}`)
      throw new ForbiddenException('Invalid client ID')
    }

    // 3. Validate issuer
    if (iss !== this.keycloakIssuer) {
      this.logger.warn(`Issuer mismatch. Expected: ${this.keycloakIssuer}, Got: ${iss}`)
      throw new ForbiddenException('Invalid token issuer')
    }

    // 4. Validate x-tenant-id header is present
    if (!xTenantId) {
      throw new BadRequestException('x-tenant-id header is required for frontend requests')
    }

    // 5. Look up tenant by external ID
    let tenant
    try {
      tenant = await this.tenantsService.findByExternalId(xTenantId)
    } catch {
      this.logger.error(`Failed to look up tenant by external ID ${xTenantId}`)
      throw new NotFoundException('Tenant not found')
    }

    if (!tenant) {
      this.logger.warn(`Tenant not found for external ID: ${xTenantId}`)
      throw new NotFoundException('Tenant not found')
    }

    // 6. Validate user has access to tenant via CSTAR
    try {
      const userTenantIds = await this.cstarApiClient.getUserTenants(sub)
      if (!userTenantIds.includes(xTenantId)) {
        this.logger.warn(
          `User ${sub} does not have access to tenant ${xTenantId}. User has access to: [${userTenantIds.join(', ')}]`,
        )
        throw new ForbiddenException('User does not have access to this tenant')
      }
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error
      }
      this.logger.error(
        `CSTAR validation failed for user ${sub}, tenant ${xTenantId}: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw new UnauthorizedException('Failed to verify tenant access')
    }

    // 7. Validate client_id + tenant_id mapping exists
    try {
      const mappedTenantIds = await this.clientTenantMappingService.findTenantsByClientId(azp)
      if (!mappedTenantIds.includes(tenant.id)) {
        this.logger.warn(
          `Client ${azp} is not mapped to tenant ${tenant.id} (external ID: ${xTenantId})`,
        )
        throw new ForbiddenException(
          'Client is not authorized to access this tenant. Please contact an administrator.',
        )
      }
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error
      }
      this.logger.error(
        `Failed to verify client mapping for ${azp} to tenant ${tenant.id}: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw new UnauthorizedException('Failed to verify client authorization')
    }

    // 8. Validate role based on source (SSO or CSTAR) if @Roles() decorator is present
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (requiredRoles && requiredRoles.length > 0) {
      // Separate SSO roles from CSTAR roles
      const ssoRoles = requiredRoles.filter((role) =>
        Object.values(SsoRole).includes(role as SsoRole),
      )
      const cstarRoles = requiredRoles.filter(
        (role) => !Object.values(SsoRole).includes(role as SsoRole),
      )

      // 8a. Validate SSO roles from JWT
      if (ssoRoles.length > 0) {
        const jwtRoles = (payload.roles as string[]) || []
        const hasSsoRole = ssoRoles.some((role) => jwtRoles.includes(role))

        if (!hasSsoRole) {
          this.logger.warn(
            `User ${sub} does not have required SSO role(s). Required: [${ssoRoles.join(', ')}], User has: [${jwtRoles.join(', ')}]`,
          )
          throw new ForbiddenException('User does not have required admin role')
        }

        this.logger.debug(`User ${sub} has required SSO role(s): [${jwtRoles.join(', ')}]`)
      }

      // 8b. Validate CSTAR roles via API
      if (cstarRoles.length > 0) {
        try {
          const userRoles = await this.cstarApiClient.getUserRoles(sub, xTenantId)
          const hasCstarRole = cstarRoles.some((role) => userRoles.includes(role))

          if (!hasCstarRole) {
            this.logger.warn(
              `User ${sub} does not have required CSTAR role(s). Required: [${cstarRoles.join(', ')}], User has: [${userRoles.join(', ')}]`,
            )
            throw new ForbiddenException('User does not have required role')
          }

          this.logger.debug(`User ${sub} has required CSTAR role(s): [${userRoles.join(', ')}]`)
        } catch (error) {
          if (error instanceof ForbiddenException) {
            throw error
          }
          this.logger.error(
            `Failed to validate CSTAR role for ${sub} in tenant ${xTenantId}: ${error instanceof Error ? error.message : String(error)}`,
          )
          throw new UnauthorizedException('Failed to verify user role')
        }
      }
    }

    // Attach context to request
    request.tenant = tenant
    request.userGuid = sub
    request.clientId = azp

    this.logger.debug(
      `Frontend request authorized. User: ${sub}, Tenant: ${tenant.name}, Client: ${azp}`,
    )

    return true
  }
}
