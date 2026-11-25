import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'
import { ROLES_KEY } from '../../../common/decorators/roles.decorator'
import { SsoRole } from '../../../enum/sso-role.enum'
import { CstarApiClient } from '../../../services/cstar/cstar-api.client'

/**
 * Lets a NOTIFY_ADMIN, or an administrator of the tenant being managed, use the CSTAR admin
 * routes.
 *
 * A caller with one of the route's SSO roles may act on any tenant. Anyone else needs one of the
 * route's CSTAR roles in the tenant they are acting on: the :tenantId in the path, or the
 * tenantId query parameter on routes without one (user search), which is the tenant the search
 * is made for in CSTAR.
 *
 * A route with no @Roles() is refused.
 */
@Injectable()
export class CstarTenantAdminGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(CstarTenantAdminGuard.name)

  constructor(
    private readonly reflector: Reflector,
    private readonly cstarApiClient: CstarApiClient,
  ) {
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
    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? []
    const isSsoRole = (role: string) => Object.values(SsoRole).includes(role as SsoRole)

    const jwtRoles = (payload.client_roles as string[] | undefined) ?? []
    if (requiredRoles.some((role) => isSsoRole(role) && jwtRoles.includes(role))) {
      return true
    }

    const cstarRoles = requiredRoles.filter((role) => !isSsoRole(role))
    if (cstarRoles.length === 0) {
      this.logger.warn(`User ${payload.sub} does not have required admin role(s)`)
      throw new ForbiddenException('User does not have required admin role')
    }

    const queryTenantId = request.query?.tenantId
    const tenantId: string | undefined =
      request.params?.tenantId ?? (typeof queryTenantId === 'string' ? queryTenantId : undefined)
    if (!tenantId) {
      throw new BadRequestException('tenantId is required')
    }

    const idirUserGuid = payload.idir_user_guid as string | undefined
    if (!idirUserGuid) {
      throw new ForbiddenException('User does not have required admin role')
    }

    let userRoles: string[]
    try {
      userRoles = await this.cstarApiClient.getUserRoles(
        tenantId,
        idirUserGuid,
        request.headers.authorization,
      )
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error
      }
      throw new UnauthorizedException('Failed to verify user CSTAR role')
    }

    if (!cstarRoles.some((role) => userRoles.includes(role))) {
      this.logger.warn(
        `User ${idirUserGuid} does not have required CSTAR role(s) in tenant ${tenantId}. Required: [${cstarRoles.join(', ')}], User has: [${userRoles.join(', ')}]`,
      )
      throw new ForbiddenException('User does not have required CSTAR role')
    }

    return true
  }
}
