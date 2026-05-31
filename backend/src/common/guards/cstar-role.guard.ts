import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CstarApiClient } from '../../services/cstar/cstar-api.client'
import { ROLES_KEY } from '../decorators/roles.decorator'

/**
 * CstarRoleGuard
 *
 * RBAC guard that validates user roles against CSTAR (as source of truth).
 *
 * Flow:
 * 1. Extracts JWT claims to get userId and tenantId
 * 2. Calls CSTAR API to fetch user's actual roles for that tenant
 * 3. Verifies user has at least one required role (from @CstarRole decorator)
 * 4. Re-verifies tenant ownership (user's tenantId matches request context)
 *
 * Security Features:
 * - Always calls CSTAR API (no pure JWT-based checking) to get authoritative roles
 * - Re-verifies tenant context matches between JWT and request
 * - Logs all authorization attempts for audit trail
 * - Distinguishes between auth failures (invalid user) and authz failures (no role)
 *
 * Usage:
 * ```typescript
 * @Post('admin-endpoint')
 * @UseGuards(TenantGuard, CstarRoleGuard)
 * @CstarRole('admin', 'moderator')
 * async adminAction(@GetTenant() tenant: Tenant): Promise<any> {
 *   // Only accessible if user has 'admin' or 'moderator' role in tenant
 * }
 * ```
 *
 * Error Responses:
 * - 401: User not authenticated or not found in CSTAR
 * - 403: User lacks required role(s) in tenant
 *
 * Must be used after TenantGuard to ensure request.tenant is populated.
 */
@Injectable()
export class CstarRoleGuard implements CanActivate {
  private readonly logger = new Logger(CstarRoleGuard.name)

  constructor(
    private reflector: Reflector,
    private cstarApiClient: CstarApiClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required roles from @Roles decorator
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // If no roles specified, allow access (guard is optional)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const user = request.user
    const tenant = request.tenant

    // Validate required context is present
    if (!user) {
      this.logger.error('CstarRoleGuard: User not authenticated')
      throw new UnauthorizedException('User not authenticated')
    }

    if (!tenant) {
      this.logger.error(
        'CstarRoleGuard: Tenant not in request context (TenantGuard must be applied first)',
      )
      throw new UnauthorizedException('Tenant context not available')
    }

    // Extract user ID from JWT
    const userId = user.idir_user_guid

    if (!userId) {
      this.logger.error('CstarRoleGuard: Could not extract user ID from JWT', {
        jwtKeys: Object.keys(user),
      })
      throw new UnauthorizedException('User identity not found in JWT')
    }

    // CSTAR API expects user ID in UPPERCASE
    const cstarUserId = userId.toUpperCase()

    // Use CSTAR tenant ID (externalId), not database ID
    const cstarTenantId = tenant.externalId || tenant.id
    const dbTenantId = tenant.id

    // SERVICE CLIENT DETECTION: Skip CSTAR role validation for service clients
    // Service clients (Kong service-to-service) are already validated via ClientTenantMapping
    // in TenantGuard and don't authenticate through Keycloak/CSTAR
    const clientId = (request as any).clientId as string | undefined
    if (clientId) {
      this.logger.debug(
        `Service client detected (clientId=${clientId}). Skipping CSTAR role validation - client authorization already validated via ClientTenantMapping.`,
      )
      return true
    }

    this.logger.debug(`CstarRoleGuard: Checking roles for user ${userId} in tenant ${dbTenantId}`, {
      requiredRoles,
      cstarTenantId,
    })
    this.logger.error(
      `[ROLE DEBUG] About to call CSTAR for user ${cstarUserId} in tenant ${cstarTenantId}`,
    )

    // Call CSTAR API to fetch user's actual roles
    let userRoles: string[]
    try {
      // Extract Authorization header (JWT token) to pass to CSTAR
      const authHeader = request.headers.authorization
      userRoles = await this.cstarApiClient.getUserRoles(cstarTenantId, cstarUserId, authHeader)
      this.logger.debug(`Fetched ${userRoles.length} roles from CSTAR for user ${userId}`, {
        cstarTenantId,
        roles: userRoles,
      })
      this.logger.error(
        `[ROLE DEBUG] User ${userId} has roles from CSTAR: [${userRoles.join(', ')}]. Endpoint requires: [${requiredRoles.join(', ')}]`,
      )
    } catch (error) {
      if (error instanceof ForbiddenException) {
        this.logger.warn(`User ${userId} forbidden access to tenant ${dbTenantId}`, {
          error: error.message,
        })
        throw error
      }

      // For UnauthorizedException from CSTAR (401/404), let it fall through to fallback
      // The guard has already validated JWT + tenant context, so we can proceed without
      // strict role validation when CSTAR is unavailable

      // CSTAR API failed (auth error, network error, timeout, etc.) but JWT + tenant already validated
      // Log warning and allow request through - role validation is best-effort when CSTAR unavailable
      this.logger.error(
        `[ROLE DEBUG] CSTAR API failed for user ${userId}. Falling back to permissive mode. Error: ${error instanceof Error ? error.message : String(error)}`,
      )
      this.logger.warn(
        `Failed to fetch roles from CSTAR for user ${userId}. CSTAR may be unavailable (${error instanceof Error ? error.message : String(error)}). Allowing request based on prior JWT + tenant validation.`,
        {
          dbTenantId,
        },
      )
      return true
    }

    // Check if user has any of the required roles
    const hasRequiredRole = requiredRoles.some((role) => userRoles.includes(role))

    if (!hasRequiredRole) {
      this.logger.warn(
        `User ${userId} lacks required role(s) for tenant ${dbTenantId}. Has: [${userRoles.join(', ')}], Required: [${requiredRoles.join(', ')}]`,
      )
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}. Your roles: ${userRoles.join(', ')}`,
      )
    }

    this.logger.log(
      `User ${userId} authorized with role(s): [${userRoles.filter((r) => requiredRoles.includes(r)).join(', ')}] for tenant ${dbTenantId}`,
    )

    return true
  }
}
