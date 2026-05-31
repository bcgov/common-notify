import { Injectable, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { JwtGuard } from '../../auth/guards/auth.jwt-guard'
import { ROLES_KEY } from '../../auth/decorators/sso-role.decorator'

/**
 * SSO role guard combining JWT validation + role checking.
 *
 * Validates JWT from Keycloak AND checks required roles in a single guard.
 * Used for endpoints requiring both JWT validation and role-based access control.
 *
 * Security Model:
 * - Validates JWT signature and expiration (via JwtGuard)
 * - Extracts role_names claim from JWT
 * - Verifies user has required role(s) (from @SsoRole decorator)
 * - Can be used with or without tenant context
 *
 * Usage:
 * @UseGuards(SSORoleGuard)
 * @SsoRole(SsoRole.NOTIFY_ADMIN)
 * deleteUser() { }
 *
 * JWT Claims Required:
 * - role_names[] - Array of assigned roles from Keycloak (e.g., ["NOTIFY_ADMIN"])
 */
@Injectable()
export class SSORoleGuard extends JwtGuard {
  constructor(
    config: ConfigService,
    private reflector: Reflector,
  ) {
    super(config)
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First validate JWT (AuthJwtGuard.canActivate)
    // Note: AuthGuard.canActivate may return Promise<boolean>, so we must await it
    const isAuthorized = await super.canActivate(context)

    if (!isAuthorized) {
      return false
    }

    // Then check role requirements
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // If no roles are specified, JWT validation is sufficient
    if (!requiredRoles || requiredRoles.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const user = request.user as any

    if (!user) {
      this.logger.warn('No user in request after JWT validation')
      throw new ForbiddenException('User not authenticated')
    }

    // Extract roles from JWT token
    // Keycloak puts roles in role_names (direct claim), realm_access.roles (realm roles),
    // or resource_access[clientId].roles (client roles)
    const userRoles: string[] = []

    if (user.role_names && Array.isArray(user.role_names)) {
      userRoles.push(...user.role_names)
    }

    if (user.realm_access?.roles) {
      userRoles.push(...user.realm_access.roles)
    }

    if (user.client_roles) {
      userRoles.push(...user.client_roles)
    }

    // Check if user has at least one of the required roles
    const hasRequiredRole = requiredRoles.some((role) => userRoles.includes(role))

    if (!hasRequiredRole) {
      this.logger.warn(
        `SSO role access denied. User lacks required role. Required: ${requiredRoles.join(', ')}, User has: ${userRoles.join(', ')}`,
      )
      throw new ForbiddenException(`Access denied. Required role(s): ${requiredRoles.join(', ')}`)
    }

    this.logger.debug(`SSO role access granted. User has role(s): ${userRoles.join(', ')}`)
    return true
  }
}
