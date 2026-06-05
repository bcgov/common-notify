import { Injectable, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { SsoRole } from '../../enum/sso-role.enum'

/**
 * NotifyAdminGuard
 *
 * Guard for admin-only routes that require JWT + SSO role validation
 * but NOT tenant-specific validation.
 *
 * Used for global admin operations like:
 * - GET /api/v1/admin/tenants
 * - POST /api/v1/admin/tenants
 * - GET /api/v1/frontend/admin/feature-flags (global feature flags)
 * - POST /api/v1/frontend/admin/clients/link-to-tenants
 *
 * Validation flow:
 * 1. Validates JWT signature via Keycloak JWKS (via AuthGuard parent)
 * 2. Validates user has required SSO role (NOTIFY_ADMIN)
 *
 */
@Injectable()
export class NotifyAdminGuard extends AuthGuard('jwt') {
  protected readonly logger = new Logger(NotifyAdminGuard.name)

  constructor(private readonly reflector: Reflector) {
    super()
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Validate JWT signature via parent AuthGuard (Passport JWT strategy)
    const jwtValidated = await super.canActivate(context)
    if (!jwtValidated) {
      return false
    }

    const request = context.switchToHttp().getRequest()
    const payload = request.user
    const sub = payload.sub as string

    // Validate SSO role if @Roles() decorator is present
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (requiredRoles && requiredRoles.length > 0) {
      // Only check SSO roles for admin guard
      const ssoRoles = requiredRoles.filter((role) =>
        Object.values(SsoRole).includes(role as SsoRole),
      )

      if (ssoRoles.length > 0) {
        // Get roles from JWT client_roles
        const jwtRoles = (payload.client_roles as string[]) || []
        const hasSsoRole = ssoRoles.some((role) => jwtRoles.includes(role))

        if (!hasSsoRole) {
          this.logger.warn(
            `User ${sub} does not have required admin role(s). Required: [${ssoRoles.join(', ')}], User has: [${jwtRoles.join(', ')}]`,
          )
          throw new ForbiddenException('User does not have required admin role')
        }

        this.logger.debug(`User ${sub} has required admin role(s): [${jwtRoles.join(', ')}]`)
      }
    }

    return true
  }
}
