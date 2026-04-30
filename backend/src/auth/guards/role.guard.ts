import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from '../decorators/require-role.decorator'

/**
 * Guard that checks if the JWT token contains the required role(s).
 * Works with Keycloak JWT tokens that have realm_access.roles or client_roles claims.
 *
 * Usage:
 * @UseGuards(AuthJwtGuard, RoleGuard)
 * @RequireRole('NOTIFY_ADMIN')
 * getAdminData() { ... }
 */
@Injectable()
export class RoleGuard implements CanActivate {
  private readonly logger = new Logger(RoleGuard.name)

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    // If no roles are specified, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const user = request.user as any

    if (!user) {
      this.logger.warn('No user in request')
      throw new ForbiddenException('User not authenticated')
    }

    // Extract roles from JWT token
    // Keycloak puts roles in realm_access.roles (realm roles) or resource_access[clientId].roles (client roles)
    const userRoles: string[] = []

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
        `User does not have required role. Required: ${requiredRoles.join(', ')}, User has: ${userRoles.join(', ')}`,
      )
      throw new ForbiddenException(`Access denied. Required role(s): ${requiredRoles.join(', ')}`)
    }

    return true
  }
}
