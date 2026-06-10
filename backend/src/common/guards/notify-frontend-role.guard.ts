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
 * 4. Requires x-tenant-id header and validates tenant exists
 * 5. Validates user has access to tenant via CSTAR API (getUserTenants)
 * 6. Validates required roles from @Roles():
 *    - SSO roles (e.g., NOTIFY_ADMIN) against JWT client_roles
 *    - CSTAR roles against CSTAR shared-service-roles for the selected tenant
 *
 * Note:
 * - Tenant-less global admin operations are handled by NotifyAdminGuard routes.
 * - This guard is tenant-scoped by design.
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

    // SSO roles from Keycloak token
    const jwtRoles = (payload.client_roles as string[]) || []

    // Required roles declared on endpoint/class. Can include SSO and CSTAR roles.
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // Validate x-tenant-id header is present (required for tenant-scoped operations)
    const xTenantId = request.headers['x-tenant-id'] as string
    if (!xTenantId) {
      this.logger.warn(`[NotifyFrontendRoleGuard] x-tenant-id header is missing`)
      throw new BadRequestException('x-tenant-id header is required for frontend requests')
    }

    // Look up tenant by external ID (required for all frontend routes using this guard)
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

    // Validate tenant membership via CSTAR for all users.
    try {
      const authHeader = request.headers.authorization as string
      const userTenants = await this.cstarApiClient.getUserTenants(idirUserGuid, authHeader)

      // userTenants can be either an array of strings (tenant IDs) or objects with id property
      const userTenantIds = userTenants.map((t: any) => (typeof t === 'string' ? t : t.id))
      if (!userTenantIds.includes(xTenantId)) {
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

    if (requiredRoles && requiredRoles.length > 0) {
      const ssoRoles = requiredRoles.filter((role) =>
        Object.values(SsoRole).includes(role as SsoRole),
      )
      const cstarRoles = requiredRoles.filter(
        (role) => !Object.values(SsoRole).includes(role as SsoRole),
      )

      if (ssoRoles.length > 0) {
        const hasSsoRole = ssoRoles.some((role) => jwtRoles.includes(role))
        if (!hasSsoRole) {
          this.logger.warn(
            `[NotifyFrontendRoleGuard] User ${idirUserGuid} missing required SSO role(s). Required: [${ssoRoles.join(', ')}], User has: [${jwtRoles.join(', ')}]`,
          )
          throw new ForbiddenException('User does not have required SSO role')
        }
      }

      if (cstarRoles.length > 0) {
        // Validate CSTAR role (fetch fresh roles from CSTAR)
        // Frontend routes commonly use CSTAR roles for tenant-scoped authorization.
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
            throw new ForbiddenException('User does not have required CSTAR role')
          }
        } catch (error) {
          if (error instanceof ForbiddenException) {
            throw error
          }
          throw new UnauthorizedException('Failed to verify user CSTAR role')
        }
      }
    }

    // Attach context to request
    request.tenant = tenant
    request.userGuid = idirUserGuid
    request.clientId = azp

    return true
  }
}
