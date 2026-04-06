import { SetMetadata } from '@nestjs/common'
import { Role } from '../../enum/role.enum'

/**
 * Roles decorator for roles based access to API.  The roles defined in role.enum are used as part of the Roles decorator.
 * For example @Roles(Role.USER) will allow users that have the NOTIFY_USER role on the JWT claim.
 */
export const ROLES_KEY = 'roles'
export const Roles = (...roles: (Role[] | Role)[]) => {
  // Three possible scenarios here
  // @Roles(Role.NOTIFY_ADMIN)
  // @Roles(roles) which is an array
  // @Roles(roles, Roles.NOTIFY_ADMIN)
  // To handle all cases we accept an array of stuff and then flatten it down.
  const flattenedRoles = roles.flat()
  return SetMetadata(ROLES_KEY, flattenedRoles)
}
