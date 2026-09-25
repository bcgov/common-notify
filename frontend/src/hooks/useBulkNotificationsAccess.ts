import { useAppSelector } from '@/redux/hooks'
import { useCstarRoles } from './useCstarRoles'
import { useFeatureFlag } from '@/config/featureFlags/useFeatureFlag'

/**
 * Whether the Bulk Notifications screen is available to this user in the selected tenant.
 *
 * Shared by the sidebar link and the route itself so the two can't disagree: a link that
 * is hidden must also lead nowhere when the URL is typed in directly.
 */
export interface BulkNotificationsAccess {
  /**
   * True once the CSTAR roles and the feature flag for the *selected* tenant have both
   * settled. Both arrive after the first render, so `canAccess` is meaningless until then.
   */
  isResolved: boolean
  /** True when the user may open the screen at all. */
  canAccess: boolean
}

export function useBulkNotificationsAccess(): BulkNotificationsAccess {
  const selectedTenant = useAppSelector((state) => state.tenant.selectedTenant)
  const rolesTenantId = useAppSelector((state) => state.user.rolesTenantId)
  const flagsTenantId = useAppSelector((state) => state.featureFlags.tenantId)
  const flagsError = useAppSelector((state) => state.featureFlags.error)

  const { hasTenantRole } = useCstarRoles()
  const enabled = useFeatureFlag('bulk_notifications', selectedTenant?.id)

  // Both lookups are per tenant, so an answer loaded for another tenant says nothing about
  // this one. A failed flag fetch counts as settled — the slice keeps the previous `byCode`
  // on error and `useFeatureFlag` falls back to false — otherwise an outage would leave the
  // page spinning forever instead of taking the same safe answer the rest of the app takes.
  const rolesSettled = rolesTenantId === selectedTenant?.id
  const flagsSettled = flagsTenantId === selectedTenant?.id || Boolean(flagsError)

  return {
    isResolved: Boolean(selectedTenant) && rolesSettled && flagsSettled,
    canAccess: hasTenantRole && enabled,
  }
}
