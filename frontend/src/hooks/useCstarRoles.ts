import { useMemo } from 'react'
import { useAppSelector } from '@/redux/hooks'
import { CstarRole } from '@/enum/cstar-role.enum'

/**
 * CSTAR roles the user holds in the *currently selected* tenant, plus helpers
 * for branching UI on them.
 *
 * Roles are re-fetched whenever the selected tenant changes and stored on
 * `state.user.current.cstarRoles`, so this hook always reflects the active
 * tenant. Use it to know exactly which role the user has and change what is
 * displayed on a page accordingly.
 */
export interface CstarRolesInfo {
  /** Raw CSTAR roles for the selected tenant. */
  roles: CstarRole[]
  /**
   * The single highest-privilege role the user holds in the selected tenant,
   * or `null` if they hold none. Useful when a page only needs one answer.
   */
  primaryRole: CstarRole | null
  /** True when the user has at least one CSTAR role in the selected tenant. */
  hasTenantRole: boolean
  /** True when the user holds the given role in the selected tenant. */
  hasRole: (role: CstarRole) => boolean
  /** True when the user may create/edit templates in the selected tenant. */
  canEdit: boolean
}

/** Highest privilege first; drives {@link CstarRolesInfo.primaryRole}. */
const ROLE_PRIORITY: readonly CstarRole[] = [
  CstarRole.NOTIFY_OPERATIONS_ADMIN,
  CstarRole.NOTIFY_TEMPLATE_EDITOR,
  CstarRole.NOTIFY_VIEWER,
]

export function useCstarRoles(): CstarRolesInfo {
  const cstarRoles = useAppSelector((state) => state.user.current?.cstarRoles)

  return useMemo(() => {
    const roles = (cstarRoles ?? []) as CstarRole[]
    const hasRole = (role: CstarRole) => roles.includes(role)
    const hasAnyRole = (...candidates: CstarRole[]) =>
      candidates.some((role) => roles.includes(role))

    return {
      roles,
      primaryRole: ROLE_PRIORITY.find((role) => roles.includes(role)) ?? null,
      hasTenantRole: roles.length > 0,
      hasRole,
      canEdit: hasAnyRole(CstarRole.NOTIFY_TEMPLATE_EDITOR, CstarRole.NOTIFY_OPERATIONS_ADMIN),
    }
  }, [cstarRoles])
}
