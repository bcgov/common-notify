import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/redux/hooks'
import { fetchFeatureFlags, markOutOfSync } from '@/redux/slices/featureFlags.slice'
import {
  selectFeatureFlag,
  selectFeatureFlagsLoading,
  selectFeatureFlagsError,
  selectShouldFetchFeatureFlagsForTenant,
  selectShouldFetchFeatureFlags,
  selectFeatureFlagsTenantId,
} from './featureFlagsSelectors'

/**
 * Custom hook to use a specific feature flag in a component
 * Automatically handles fetching and caching per tenant
 *
 * Example usage:
 * ```
 * const smsEnabled = useFeatureFlag('sms_notifications');
 * if (smsEnabled) {
 *   return <SMSNotifications />;
 * }
 * return <SMSComingSoon />;
 * ```
 *
 * @param code - Feature flag code (e.g., 'sms_notifications')
 * @param tenantId - Optional tenant ID (uses current tenant if not provided)
 * @returns boolean - Whether the feature is enabled (defaults to false if not found or disabled)
 */
export function useFeatureFlag(code: string, tenantId?: string): boolean {
  const dispatch = useAppDispatch()
  const enabled = useAppSelector((state) => selectFeatureFlag(state, code))
  const error = useAppSelector(selectFeatureFlagsError)
  const shouldFetch = useAppSelector((state) =>
    selectShouldFetchFeatureFlagsForTenant(state, tenantId),
  )

  useEffect(() => {
    // Fetch flags if:
    // 1. Not already synced/loading, OR
    // 2. Tenant ID changed
    if (shouldFetch && tenantId) {
      dispatch(fetchFeatureFlags(tenantId))
    }
  }, [dispatch, shouldFetch, tenantId])

  // Log error for debugging (but still return safe default)
  if (error) {
    console.warn(`Feature flag error for ${code}:`, error)
  }

  return enabled ?? false
}

/**
 * Custom hook to check multiple feature flags at once
 *
 * Example usage:
 * ```
 * const { sms: smsEnabled, sse: sseEnabled } = useFeatureFlags(['sms_notifications', 'sse_notifications']);
 * ```
 *
 * @param codes - Array of feature flag codes
 * @param tenantId - Optional tenant ID
 * @returns Record of code => enabled status
 */
export function useFeatureFlags(codes: string[], tenantId?: string): Record<string, boolean> {
  const dispatch = useAppDispatch()
  const allFlags = useAppSelector((state) => state.featureFlags.byCode)
  const shouldFetch = useAppSelector(selectShouldFetchFeatureFlags)
  const currentTenantId = useAppSelector(selectFeatureFlagsTenantId)

  useEffect(() => {
    if (shouldFetch) {
      dispatch(fetchFeatureFlags(tenantId || currentTenantId))
    }
  }, [dispatch, shouldFetch, tenantId, currentTenantId])

  // Create result object with safe defaults
  return codes.reduce(
    (result, code) => {
      result[code] = allFlags[code] ?? false
      return result
    },
    {} as Record<string, boolean>,
  )
}

/**
 * Custom hook to get feature flag state with loading and error info
 *
 * Example usage:
 * ```
 * const { enabled, loading, error } = useFeatureFlagWithStatus('sms_notifications');
 * if (loading) return <Spinner />;
 * if (error) return <ErrorMessage>{error}</ErrorMessage>;
 * return enabled ? <SMS /> : <SMSDisabled />;
 * ```
 *
 * @param code - Feature flag code
 * @param tenantId - Optional tenant ID
 * @returns Object with enabled status, loading state, and error message
 */
export function useFeatureFlagWithStatus(code: string, tenantId?: string) {
  const dispatch = useAppDispatch()
  const enabled = useAppSelector((state) => selectFeatureFlag(state, code))
  const loading = useAppSelector(selectFeatureFlagsLoading)
  const error = useAppSelector(selectFeatureFlagsError)
  const shouldFetch = useAppSelector(selectShouldFetchFeatureFlags)
  const currentTenantId = useAppSelector(selectFeatureFlagsTenantId)

  useEffect(() => {
    if (shouldFetch) {
      dispatch(fetchFeatureFlags(tenantId || currentTenantId))
    }
  }, [dispatch, shouldFetch, tenantId, currentTenantId])

  return {
    enabled: enabled ?? false,
    loading,
    error,
  }
}

/**
 * Hook to handle tenant changes
 * Mark flags as out of sync when tenant ID changes
 *
 * Example usage:
 * ```
 * const tenantId = useGetTenantId(); // your tenant hook
 * useFeatureFlagTenantChange(tenantId);
 * ```
 *
 * @param tenantId - Current tenant ID
 */
export function useFeatureFlagTenantChange(tenantId?: string) {
  const dispatch = useAppDispatch()
  const currentTenantId = useAppSelector(selectFeatureFlagsTenantId)

  useEffect(() => {
    // If tenant changed, mark flags as out of sync
    if (tenantId && tenantId !== currentTenantId) {
      dispatch(markOutOfSync())
    }
  }, [dispatch, tenantId, currentTenantId])
}
