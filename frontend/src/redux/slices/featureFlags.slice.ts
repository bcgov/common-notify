import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'
import type { FeatureFlag } from '@/interfaces/feature-flag.interface'
import {
  fetchFeatureFlags,
  fetchAllFeatureFlags,
  createFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
} from '../thunks/featureFlags.thunks'

/**
 * Redux state for feature flags
 * Maps feature codes to enabled status with tenant context
 */
export interface FeatureFlagsState {
  /**
   * Feature flags keyed by code
   * Example: { sms_notifications: false, sse_notifications: true, dashboard: true }
   */
  byCode: Record<string, boolean>

  /**
   * Tenant ID for which flags are loaded
   * Used to refetch flags if tenant changes
   */
  tenantId?: string

  /**
   * All feature flags for admin view
   */
  flagsList: FeatureFlag[]

  /**
   * Loading state for fetch operations
   */
  loading: boolean

  /**
   * Whether the current flags are synced with server
   * Set to false when tenant changes or after mutations
   */
  synced: boolean

  /**
   * Error message if fetch fails
   */
  error?: string
}

const initialState: FeatureFlagsState = {
  byCode: {},
  flagsList: [],
  loading: false,
  synced: false,
}

const featureFlagsSlice = createSlice({
  name: 'featureFlags',
  initialState,
  reducers: {
    /**
     * Mark flags as out of sync (e.g., after tenant change)
     */
    markOutOfSync: (state) => {
      state.synced = false
    },

    /**
     * Optimistic update for local state
     * Used before server confirmation for better UX
     */
    updateLocalFlag: (state, action: PayloadAction<{ code: string; enabled: boolean }>) => {
      state.byCode[action.payload.code] = action.payload.enabled
    },

    /**
     * Clear all feature flags (e.g., on logout)
     */
    clearFeatureFlags: () => initialState,
  },
  extraReducers: (builder) => {
    // Fetch feature flags for user
    builder
      .addCase(fetchFeatureFlags.pending, (state) => {
        state.loading = true
        state.error = undefined
      })
      .addCase(fetchFeatureFlags.fulfilled, (state, action) => {
        state.byCode = action.payload.flags
        state.tenantId = action.payload.tenantId
        state.loading = false
        state.synced = true
        state.error = undefined
      })
      .addCase(fetchFeatureFlags.rejected, (state, action) => {
        state.loading = false
        state.synced = false
        state.error = action.payload as string
        // Keep previous flags on error (graceful degradation)
      })

    // Fetch all flags for admin
    builder
      .addCase(fetchAllFeatureFlags.pending, (state) => {
        state.loading = true
        state.error = undefined
      })
      .addCase(fetchAllFeatureFlags.fulfilled, (state, action) => {
        state.flagsList = action.payload
        state.loading = false
        state.error = undefined
      })
      .addCase(fetchAllFeatureFlags.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Create feature flag
    builder
      .addCase(createFeatureFlag.pending, (state) => {
        state.error = undefined
      })
      .addCase(createFeatureFlag.fulfilled, (state, action) => {
        state.flagsList.push(action.payload)
        state.error = undefined
      })
      .addCase(createFeatureFlag.rejected, (state, action) => {
        state.error = action.payload as string
      })

    // Update feature flag
    builder
      .addCase(updateFeatureFlag.pending, (state) => {
        state.error = undefined
      })
      .addCase(updateFeatureFlag.fulfilled, (state) => {
        // Mark as out of sync to refetch complete list
        state.error = undefined
      })
      .addCase(updateFeatureFlag.rejected, (state, action) => {
        state.error = action.payload as string
      })

    // Delete feature flag
    builder
      .addCase(deleteFeatureFlag.pending, (state) => {
        state.error = undefined
      })
      .addCase(deleteFeatureFlag.fulfilled, (state, action) => {
        state.flagsList = state.flagsList.filter((f) => f.id !== action.payload)
        state.error = undefined
      })
      .addCase(deleteFeatureFlag.rejected, (state, action) => {
        state.error = action.payload as string
      })
  },
})

export const { markOutOfSync, updateLocalFlag, clearFeatureFlags } = featureFlagsSlice.actions

// Re-export thunks for convenience
export {
  fetchFeatureFlags,
  fetchAllFeatureFlags,
  createFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
} from '../thunks/featureFlags.thunks'

export default featureFlagsSlice.reducer
