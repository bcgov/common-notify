import { describe, it, expect } from 'vitest'
import featureFlagsReducer, {
  fetchFeatureFlags,
  updateFeatureFlag,
  markOutOfSync,
  updateLocalFlag,
  clearFeatureFlags,
  type FeatureFlagsState,
} from '@/redux/slices/featureFlags.slice'

describe('featureFlagsSlice', () => {
  const initialState: FeatureFlagsState = {
    byCode: {},
    flagsList: [],
    loading: false,
    synced: false,
  }

  describe('reducers', () => {
    it('should have initial state', () => {
      const state = featureFlagsReducer(undefined, { type: 'unknown' })
      expect(state).toEqual(initialState)
    })

    it('should mark flags as out of sync', () => {
      const state: FeatureFlagsState = {
        byCode: { sms_notifications: true },
        flagsList: [],
        tenantId: '123',
        loading: false,
        synced: true,
      }

      const newState = featureFlagsReducer(state, markOutOfSync())

      expect(newState.synced).toBe(false)
      expect(newState.byCode).toEqual({ sms_notifications: true })
    })

    it('should update a local flag', () => {
      const state: FeatureFlagsState = {
        byCode: { sms_notifications: false },
        flagsList: [],
        loading: false,
        synced: true,
      }

      const newState = featureFlagsReducer(
        state,
        updateLocalFlag({ code: 'sms_notifications', enabled: true }),
      )

      expect(newState.byCode.sms_notifications).toBe(true)
    })

    it('should clear feature flags', () => {
      const state: FeatureFlagsState = {
        byCode: { sms_notifications: true, dashboard: true },
        flagsList: [],
        tenantId: '123',
        loading: false,
        synced: true,
      }

      const newState = featureFlagsReducer(state, clearFeatureFlags())

      expect(newState).toEqual(initialState)
    })
  })

  describe('fetchFeatureFlags thunk', () => {
    it('should handle fulfilled state', () => {
      const payload = {
        flags: { sms_notifications: false, dashboard: true },
        tenantId: 'tenant-123',
      }

      const state = featureFlagsReducer(
        { ...initialState, loading: true },
        fetchFeatureFlags.fulfilled(payload, '', undefined, {}),
      )

      expect(state.byCode).toEqual(payload.flags)
      expect(state.tenantId).toBe('tenant-123')
      expect(state.loading).toBe(false)
      expect(state.synced).toBe(true)
      expect(state.error).toBeUndefined()
    })

    it('should handle pending state', () => {
      const state = featureFlagsReducer(initialState, fetchFeatureFlags.pending('', undefined, {}))

      expect(state.loading).toBe(true)
      expect(state.error).toBeUndefined()
    })

    it('should handle rejected state', () => {
      const error = 'Failed to fetch feature flags'
      const state = featureFlagsReducer(
        initialState,
        fetchFeatureFlags.rejected(new Error(), '', undefined, {}, error),
      )

      expect(state.loading).toBe(false)
      expect(state.synced).toBe(false)
      expect(state.error).toBe(error)
    })

    it('should keep previous flags on error (graceful degradation)', () => {
      const previousState: FeatureFlagsState = {
        byCode: { sms_notifications: true, dashboard: true },
        flagsList: [],
        loading: true,
        synced: true,
      }

      const error = 'Network error'
      const state = featureFlagsReducer(
        previousState,
        fetchFeatureFlags.rejected(new Error(), '', undefined, {}, error),
      )

      expect(state.byCode).toEqual(previousState.byCode)
      expect(state.error).toBe(error)
    })
  })

  describe('updateFeatureFlag thunk', () => {
    it('should handle fulfilled state', () => {
      const payload = { id: '1', enabled: true }
      const previousState: FeatureFlagsState = {
        byCode: { sms_notifications: false },
        flagsList: [],
        loading: false,
        synced: true,
      }

      const state = featureFlagsReducer(
        previousState,
        updateFeatureFlag.fulfilled(payload, '', { id: '1', enabled: true }, {}),
      )

      expect(state.synced).toBe(false)
      expect(state.error).toBeUndefined()
    })

    it('should handle pending state', () => {
      const state = featureFlagsReducer(
        initialState,
        updateFeatureFlag.pending('', { id: '1', enabled: true }, {}),
      )

      expect(state.error).toBeUndefined()
    })

    it('should handle rejected state', () => {
      const error = 'Failed to update feature flag'
      const state = featureFlagsReducer(
        initialState,
        updateFeatureFlag.rejected(new Error(), '', { id: '1', enabled: true }, {}, error),
      )

      expect(state.error).toBe(error)
    })
  })
})
