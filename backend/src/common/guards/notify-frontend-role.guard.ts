import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { AuthGuard } from '@nestjs/passport'
import { TenantsService } from '../../api/admin/tenants/tenants.service'
import { CstarApiClient } from '../../services/cstar/cstar-api.client'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { SsoRole } from '../../enum/sso-role.enum'
import { CstarRole } from '../../enum/cstar-role.enum'

/**
 * NotifyFrontendRoleGuard
 *
 * Guard for frontend routes that require both authentication, tenant-scoped authorization,
 * AND role-based access control
 *
 * Validation flow:
 * 1. Validates JWT signature via Keycloak JWKS (via AuthGuard parent)
 * 2. Validates client ID matches configured NOTIFY_CLIENT_ID (azp claim)
 * 3. Validates JWT issuer matches FRONTEND_KEYCLOAK_ISSUER
 * 4. If user has NOTIFY_ADMIN role, SKIP steps 5-7 (tenant/CSTAR validation)
 *    This allows admins to bootstrap the system without needing CSTAR setup
 * 5. Requires x-tenant-id header (user's selected tenant from frontend)
 * 6. Validates tenant exists in database
 * 7. Validates user has access to tenant via CSTAR API (getUserTenants)
 * 8. Validates user CSTAR role via @Roles() decorator
 */
@Injectable()
export class NotifyFrontendRoleGuard extends AuthGuard('jwt') {
  protected readonly logger = new Logger(NotifyFrontendRoleGuard.name)
  private readonly keycloakClientId: string
  private readonly keycloakIssuer: string

  constructor(
    private readonly reflector: Reflector,
    configService: ConfigService,
    private tenantsService: TenantsService,
    private cstarApiClient: CstarApiClient,
  ) {
    super()
    this.keycloakClientId = configService.getOrThrow('auth.notifyClientId')
    this.keycloakIssuer = configService.getOrThrow('auth.frontendKeycloakIssuer')
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Validate JWT signature via parent AuthGuard (Passport JWT strategy)
    const jwtValidated = await super.canActivate(context)
    if (!jwtValidated) {
      this.logger.warn(`[NotifyFrontendRoleGuard] JWT validation failed`)
      return false
    }

    const request = context.switchToHttp().getRequest()
    const payload = request.user
    const azp = payload.azp as string
    const iss = payload.iss as string
    const idirUserGuid = payload.idir_user_guid as string

    // Validate client ID (azp claim must match KEYCLOAK_CLIENT_ID)
    if (azp !== this.keycloakClientId) {
      this.logger.warn(
        `[NotifyFrontendRoleGuard] Client ID mismatch. Expected: ${this.keycloakClientId}, Got: ${azp}`,
      )
      throw new ForbiddenException('Invalid client ID')
    }

    // Validate issuer
    if (iss !== this.keycloakIssuer) {
      this.logger.warn(
        `[NotifyFrontendRoleGuard] Issuer mismatch. Expected: ${this.keycloakIssuer}, Got: ${iss}`,
      )
      throw new ForbiddenException('Invalid token issuer')
    }

    // Check for NOTIFY_ADMIN role early (but don't skip tenant validation)
    // Admins still need to provide a valid tenant, but skip CSTAR checks
    const jwtRoles = (payload.client_roles as string[]) || []
    const hasNotifyAdminRole = jwtRoles.includes(SsoRole.NOTIFY_ADMIN)

    // Check if endpoint requires NOTIFY_OPERATIONS_ADMIN (global admin operation)
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    const isGlobalAdminOp = requiredRoles?.includes(CstarRole.NOTIFY_OPERATIONS_ADMIN)

    // For global admin operations, skip tenant context checks - no x-tenant-id needed
    if (isGlobalAdminOp) {
      request.userGuid = idirUserGuid
      request.clientId = azp
      request.isGlobalAdmin = true
      return true
    }

    // Validate x-tenant-id header is present (required for tenant-scoped operations)
    const xTenantId = request.headers['x-tenant-id'] as string
    if (!xTenantId) {
      this.logger.warn(`[NotifyFrontendRoleGuard] x-tenant-id header is missing`)
      throw new BadRequestException('x-tenant-id header is required for frontend requests')
    }

    // Look up tenant by external ID (required for both admins and regular users)
    let tenant
    try {
      tenant = await this.tenantsService.findByExternalId(xTenantId)
    } catch {
      throw new BadRequestException(
        `Tenant with ID "${xTenantId}" does not exist. Please verify the tenant ID and try again.`,
      )
    }

    if (!tenant) {
      throw new BadRequestException(
        `Tenant with ID "${xTenantId}" does not exist. Please verify the tenant ID and try again.`,
      )
    }

    // If user is NOTIFY_ADMIN, skip CSTAR validation and return early
    if (hasNotifyAdminRole) {
      request.userGuid = idirUserGuid
      request.clientId = azp
      request.isAdmin = true
      request.tenant = tenant
      return true
    }

    // For non-admin users, validate access via CSTAR
    try {
      const authHeader = request.headers.authorization as string
      const userTenants = await this.cstarApiClient.getUserTenants(idirUserGuid, authHeader)

      if (!userTenants.includes(xTenantId)) {
        this.logger.warn(
          `[NotifyFrontendRoleGuard] User ${idirUserGuid} does not have access to tenant ${xTenantId}`,
        )
        throw new ForbiddenException('User does not have access to this tenant')
      }
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error
      }
      if (error instanceof UnauthorizedException) {
        throw error
      }
      throw new UnauthorizedException('Failed to verify tenant access')
    }

    // Check if @Roles() decorator is present (only then validate with CSTAR)
    // requiredRoles already retrieved above for global admin check

    if (requiredRoles && requiredRoles.length > 0) {
      // Validate CSTAR role (fetch fresh roles from CSTAR)
      // Frontend routes only use CSTAR roles (not SSO roles)
      // SSO role validation (NOTIFY_ADMIN) is handled by NotifyAdminGuard
      const cstarRoles = requiredRoles

      try {
        const authHeader = request.headers.authorization as string
        const userRoles = await this.cstarApiClient.getUserRoles(
          xTenantId,
          idirUserGuid,
          authHeader,
        )
        const hasCstarRole = cstarRoles.some((role) => userRoles.includes(role))

        if (!hasCstarRole) {
          this.logger.warn(
            `[NotifyFrontendRoleGuard] User ${idirUserGuid} does not have required CSTAR role(s). Required: [${cstarRoles.join(', ')}], User has: [${userRoles.join(', ')}]`,
          )
          throw new ForbiddenException('User does not have required role')
        }
      } catch (error) {
        if (error instanceof ForbiddenException) {
          throw error
        }
        throw new UnauthorizedException('Failed to verify user role')
      }
    }

    // Attach context to request
    request.tenant = tenant
    request.userGuid = idirUserGuid
    request.clientId = azp

    return true
  }
}
