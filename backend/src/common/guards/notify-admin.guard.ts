import { Injectable, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { SsoRole } from '../../enum/sso-role.enum'
import { AuthenticatedUserGuard } from './authenticated-user.guard'

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
 *
 * Validation flow:
 * 1. Validates the JWT, that it was issued to the Notify client (azp) and by the frontend
 *    realm (iss), via {@link AuthenticatedUserGuard}. client_roles are the roles of the client
 *    the token was issued to, and the realm is shared, so they mean nothing until azp is checked.
 * 2. Validates the user has one of the SSO roles in @Roles(). A route that names none is denied.
 */
@Injectable()
export class NotifyAdminGuard extends AuthenticatedUserGuard {
  protected readonly logger = new Logger(NotifyAdminGuard.name)

  constructor(
    configService: ConfigService,
    private readonly reflector: Reflector,
  ) {
    super(configService)
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await super.canActivate(context))) {
      return false
    }

    const { sub, client_roles: clientRoles } = context.switchToHttp().getRequest().user

    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? []
    const ssoRoles = requiredRoles.filter((role) =>
      Object.values(SsoRole).includes(role as SsoRole),
    )
    if (ssoRoles.length === 0) {
      this.logger.error(
        `${context.getClass().name}.${context.getHandler().name} uses NotifyAdminGuard without an SSO role in @Roles()`,
      )
      throw new ForbiddenException('User does not have required admin role')
    }

    const jwtRoles: string[] = Array.isArray(clientRoles) ? clientRoles : []
    if (!ssoRoles.some((role) => jwtRoles.includes(role))) {
      this.logger.warn(
        `User ${sub} does not have required admin role(s). Required: [${ssoRoles.join(', ')}], User has: [${jwtRoles.join(', ')}]`,
      )
      throw new ForbiddenException('User does not have required admin role')
    }

    this.logger.debug(`User ${sub} has required admin role(s): [${jwtRoles.join(', ')}]`)
    return true
  }
}
