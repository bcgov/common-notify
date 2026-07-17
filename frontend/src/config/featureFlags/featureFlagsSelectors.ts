import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from '../../redux/store'

/**
 * Redux selectors for feature flags
 * Use these in components to access feature flag state
 */

/**
 * Get the entire feature flags state
 */
export const selectFeatureFlagsState = (state: RootState) =>
  state.featureFlags ?? {
    byCode: {},
    flagsList: [],
    loading: false,
    synced: false,
  }

/**
 * Get all feature flags as a record
 */
export const selectAllFeatureFlags = createSelector(
  [selectFeatureFlagsState],
  (state) => state?.byCode ?? {},
)

/**
 * Get a specific feature flag by code
 * Returns true if enabled, false if disabled or not found
 *
 * Usage: useSelector((state) => selectFeatureFlag(state, 'sms_notifications'))
 * Or better with custom hook: useFeatureFlag('sms_notifications')
 */
export const selectFeatureFlag = createSelector(
  [selectFeatureFlagsState, (_: RootState, code: string) => code],
  (state, code) => state?.byCode?.[code] ?? false,
)

/**
 * Get loading state
 */
export const selectFeatureFlagsLoading = createSelector(
  [selectFeatureFlagsState],
  (state) => state?.loading ?? false,
)

/**
 * Get sync status
 */
export const selectFeatureFlagsSynced = createSelector(
  [selectFeatureFlagsState],
  (state) => state?.synced ?? false,
)

/**
 * Get error message if any
 */
export const selectFeatureFlagsError = createSelector(
  [selectFeatureFlagsState],
  (state) => state?.error,
)

/**
 * Get current tenant ID for which flags are loaded
 */
export const selectFeatureFlagsTenantId = createSelector(
  [selectFeatureFlagsState],
  (state) => state?.tenantId,
)

/**
 * Check if flags need to be fetched for a specific tenant
 * Returns true if:
 * - Not currently synced, OR
 * - Still loading, OR
 * - Tenant ID changed (need to fetch for different tenant)
 */
export const selectShouldFetchFeatureFlagsForTenant = createSelector(
  [selectFeatureFlagsState, (_: RootState, tenantId?: string) => tenantId],
  (state, requestedTenantId) => {
    const needsSync = !state.synced || state.loading
    const tenantChanged = state.tenantId !== requestedTenantId
    return needsSync || tenantChanged
  },
)

/**
 * Check if flags need to be fetched
 * Returns true if not synced or loading
 */
export const selectShouldFetchFeatureFlags = createSelector(
  [selectFeatureFlagsState],
  (state) => !state.synced || state.loading,
)

/**
 * Get all feature flags list for admin view, sorted by creation date (stable order)
 */
export const selectAllFeatureFlagsList = createSelector([selectFeatureFlagsState], (state) =>
  [...state.flagsList].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  ),
)
