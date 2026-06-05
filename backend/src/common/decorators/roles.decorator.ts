import { SetMetadata } from '@nestjs/common'
import { SsoRole } from '../../enum/sso-role.enum'
import { CstarRole } from '../../enum/cstar-role.enum'

/**
 * Metadata key for both CSTAR and SSO roles
 */
export const ROLES_KEY = 'roles'

/**
 * Roles decorator for both CSTAR and SSO role-based access control.
 *
 * Accepts either CstarRole or SsoRole enum values and marks an endpoint as requiring
 * specific roles. The appropriate guard (CstarRoleGuard or SSORoleGuard) will validate
 * the roles based on the endpoint's requirements.
 *
 * Example with SSO roles:
 * ```typescript
 * @Get('admin-only')
 * @UseGuards(SSORoleGuard)
 * @Roles(SsoRole.NOTIFY_ADMIN)
 * getAdminData() { }
 * ```
 *
 * Example with CSTAR roles:
 * ```typescript
 * @Get('admin-only')
 * @UseGuards(CstarRoleGuard)
 * @Roles(CstarRole.NOTIFY_OPERATIONS_ADMIN)
 * getAdminData() { }
 * ```
 *
 * @param roles One or more role values (CstarRole or SsoRole enum values) required to access this endpoint
 */
export const Roles = (...roles: (SsoRole | CstarRole | (SsoRole | CstarRole)[])[]) => {
  // Handle both individual roles and arrays of roles
  const flattenedRoles = roles.flat()
  return SetMetadata(ROLES_KEY, flattenedRoles)
}

/**
 * @deprecated Use @Roles instead
 */
export const RequireRole = (...roles: (SsoRole | CstarRole | string)[]) => {
  // Handle legacy string-based roles for backward compatibility
  return SetMetadata(ROLES_KEY, roles.flat())
}
