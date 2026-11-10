import { useAppSelector } from '@/redux/hooks'
import { useCstarRoles } from './useCstarRoles'
import { useFeatureFlag } from '@/config/featureFlags/useFeatureFlag'

/**
 * Whether the Dashboard screen is available to this user in the selected tenant.
 *
 * Shared by the sidebar link and the route itself so the two can't disagree: a link that
 * is hidden must also lead nowhere when the URL is typed in directly.
 */
export interface DashboardAccess {
  /**
   * True once the CSTAR roles and the feature flag for the *selected* tenant have both
   * settled. Both arrive after the first render, so `canAccess` is meaningless until then.
   */
  isResolved: boolean
  /** True when the user may open the screen at all. */
  canAccess: boolean
}

export function useDashboardAccess(): DashboardAccess {
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const rolesTenantId = useAppSelector((state) => state.user.rolesTenantId)
  const flagsTenantId = useAppSelector((state) => state.featureFlags.tenantId)
  const flagsError = useAppSelector((state) => state.featureFlags.error)

  const { hasTenantRole } = useCstarRoles()
  const enabled = useFeatureFlag('dashboard', selectedTenant?.id)

  // Both lookups are per tenant, so an answer loaded for another tenant says nothing about
  // this one. Count a failed flag fetch as settled so the page does not spin forever.
  // The existing flag slice retains its previous values on error.
  const rolesSettled = rolesTenantId === selectedTenant?.id
  const flagsSettled = flagsTenantId === selectedTenant?.id || Boolean(flagsError)

  return {
    isResolved: Boolean(selectedTenant) && rolesSettled && flagsSettled,
    canAccess: hasTenantRole && enabled,
  }
}
