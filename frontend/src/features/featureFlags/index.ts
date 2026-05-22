/**
 * Feature Flags Module - Exports for easy importing
 *
 * Usage:
 * import { useFeatureFlag, featureFlagsReducer } from '@/features/featureFlags';
 */

export { default as featureFlagsReducer } from '@/redux/slices/featureFlags.slice'
export {
  fetchFeatureFlags,
  fetchAllFeatureFlags,
  createFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
  markOutOfSync,
  updateLocalFlag,
  clearFeatureFlags,
} from '@/redux/slices/featureFlags.slice'
export {
  selectAllFeatureFlags,
  selectFeatureFlag,
  selectFeatureFlagsLoading,
  selectFeatureFlagsSynced,
  selectFeatureFlagsError,
  selectFeatureFlagsTenantId,
  selectShouldFetchFeatureFlags,
} from './featureFlagsSelectors'
export {
  useFeatureFlag,
  useFeatureFlags,
  useFeatureFlagWithStatus,
  useFeatureFlagTenantChange,
} from './useFeatureFlag'
