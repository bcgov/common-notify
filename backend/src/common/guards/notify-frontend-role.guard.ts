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
 * 4. Requires x-tenant-id header (user's selected tenant from frontend)
 * 5. Validates tenant exists in database
 * 6. Validates user has access to tenant via CSTAR API (getUserTenants)
 * 7. Validates user CSTAR role via @Roles() decorator
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
    this.logger.debug(`[NotifyFrontendRoleGuard] Starting guard validation`)

    // Validate JWT signature via parent AuthGuard (Passport JWT strategy)
    const jwtValidated = await super.canActivate(context)
    if (!jwtValidated) {
      this.logger.warn(`[NotifyFrontendRoleGuard] JWT validation failed`)
      return false
    }

    const request = context.switchToHttp().getRequest()
    const url = request.url
    this.logger.debug(`[NotifyFrontendRoleGuard] Processing request to: ${url}`)

    const payload = request.user
    const azp = payload.azp as string
    const sub = payload.sub as string
    const iss = payload.iss as string
    const idirUserGuid = payload.idir_user_guid as string
    const xTenantId = request.headers['x-tenant-id'] as string

    this.logger.debug(
      `[NotifyFrontendRoleGuard] JWT Claims: sub=${sub}, azp=${azp}, iss=${iss}, idir_user_guid=${idirUserGuid}`,
    )
    this.logger.debug(`[NotifyFrontendRoleGuard] x-tenant-id=${xTenantId}`)

    // Validate client ID (azp claim must match KEYCLOAK_CLIENT_ID)
    if (azp !== this.keycloakClientId) {
      this.logger.warn(
        `[NotifyFrontendRoleGuard] Client ID mismatch. Expected: ${this.keycloakClientId}, Got: ${azp}`,
      )
      throw new ForbiddenException('Invalid client ID')
    }
    this.logger.debug(`[NotifyFrontendRoleGuard] ✓ Client ID validated`)

    // Validate issuer
    if (iss !== this.keycloakIssuer) {
      this.logger.warn(
        `[NotifyFrontendRoleGuard] Issuer mismatch. Expected: ${this.keycloakIssuer}, Got: ${iss}`,
      )
      throw new ForbiddenException('Invalid token issuer')
    }
    this.logger.debug(`[NotifyFrontendRoleGuard] ✓ Issuer validated`)

    // Validate x-tenant-id header is present
    if (!xTenantId) {
      this.logger.warn(`[NotifyFrontendRoleGuard] x-tenant-id header is missing`)
      throw new BadRequestException('x-tenant-id header is required for frontend requests')
    }
    this.logger.debug(`[NotifyFrontendRoleGuard] ✓ x-tenant-id header present`)

    // Look up tenant by external ID
    let tenant
    try {
      this.logger.debug(`[NotifyFrontendRoleGuard] Looking up tenant by external ID: ${xTenantId}`)
      tenant = await this.tenantsService.findByExternalId(xTenantId)
    } catch {
      this.logger.error(
        `[NotifyFrontendRoleGuard] Failed to look up tenant by external ID ${xTenantId}`,
      )
      throw new BadRequestException(
        `Tenant with ID "${xTenantId}" does not exist. Please verify the tenant ID and try again.`,
      )
    }

    if (!tenant) {
      this.logger.warn(`[NotifyFrontendRoleGuard] Tenant not found for external ID: ${xTenantId}`)
      throw new BadRequestException(
        `Tenant with ID "${xTenantId}" does not exist. Please verify the tenant ID and try again.`,
      )
    }
    this.logger.debug(`[NotifyFrontendRoleGuard] ✓ Tenant found: ${tenant.name} (id=${tenant.id})`)

    // Validate user has access to tenant via CSTAR by fetching their accessible tenants
    try {
      const authHeader = request.headers.authorization as string
      this.logger.debug(
        `[NotifyFrontendRoleGuard] Calling CSTAR to verify user ${idirUserGuid} has access to tenant ${xTenantId}`,
      )
      this.logger.debug(`[NotifyFrontendRoleGuard] Authorization header present: ${!!authHeader}`)

      const userTenants = await this.cstarApiClient.getUserTenants(idirUserGuid, authHeader)
      this.logger.debug(
        `[NotifyFrontendRoleGuard] User ${idirUserGuid} has access to CSTAR tenants: [${userTenants.join(', ')}]`,
      )

      if (!userTenants.includes(xTenantId)) {
        this.logger.warn(
          `[NotifyFrontendRoleGuard] User ${idirUserGuid} does not have access to tenant ${xTenantId}`,
        )
        throw new ForbiddenException('User does not have access to this tenant')
      }
      this.logger.debug(
        `[NotifyFrontendRoleGuard] ✓ User ${idirUserGuid} has access to tenant ${xTenantId}`,
      )
    } catch (error) {
      this.logger.error(
        `[NotifyFrontendRoleGuard] ✗ Failed to verify tenant access for user ${idirUserGuid}`,
      )
      if (error instanceof ForbiddenException) {
        throw error
      }
      if (error instanceof UnauthorizedException) {
        this.logger.error(`[NotifyFrontendRoleGuard] UnauthorizedException: ${error.message}`)
        throw error
      }
      this.logger.error(
        `[NotifyFrontendRoleGuard] Error details: ${error instanceof Error ? error.message : String(error)}`,
      )
      throw new UnauthorizedException('Failed to verify tenant access')
    }

    // Check if @Roles() decorator is present (only then validate with CSTAR)
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (requiredRoles && requiredRoles.length > 0) {
      this.logger.debug(
        `[NotifyFrontendRoleGuard] @Roles decorator found. Required roles: [${requiredRoles.join(', ')}]`,
      )
      // Validate CSTAR role (fetch fresh roles from CSTAR)
      // Frontend routes only use CSTAR roles (not SSO roles)
      // SSO role validation (NOTIFY_ADMIN) is handled by NotifyAdminGuard
      const cstarRoles = requiredRoles

      try {
        const authHeader = request.headers.authorization as string
        this.logger.debug(
          `[NotifyFrontendRoleGuard] Fetching CSTAR roles to validate required roles`,
        )
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

        this.logger.debug(
          `[NotifyFrontendRoleGuard] ✓ User ${idirUserGuid} has required CSTAR role(s): [${userRoles.join(', ')}]`,
        )
      } catch (error) {
        if (error instanceof ForbiddenException) {
          throw error
        }
        this.logger.error(
          `[NotifyFrontendRoleGuard] Failed to validate CSTAR role for ${idirUserGuid} in tenant ${xTenantId}: ${error instanceof Error ? error.message : String(error)}`,
        )
        throw new UnauthorizedException('Failed to verify user role')
      }
    } else {
      this.logger.debug(`[NotifyFrontendRoleGuard] No @Roles decorator found on endpoint`)
    }

    // Attach context to request
    request.tenant = tenant
    request.userGuid = idirUserGuid
    request.clientId = azp

    this.logger.debug(
      `[NotifyFrontendRoleGuard] ✓✓✓ ALL VALIDATIONS PASSED. User: ${idirUserGuid}, Tenant: ${tenant.name}, Client: ${azp}`,
    )

    return true
  }
}
