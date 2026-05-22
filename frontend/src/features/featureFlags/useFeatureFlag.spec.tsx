import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import React from 'react'
import featureFlagsReducer from '@/redux/slices/featureFlags.slice'
import {
  useFeatureFlag,
  useFeatureFlags,
  useFeatureFlagWithStatus,
  useFeatureFlagTenantChange,
} from './useFeatureFlag'
import type { ReactNode } from 'react'

// Mock fetch
;(globalThis as any).fetch = vi.fn()

describe('useFeatureFlag hooks', () => {
  let store: any

  beforeEach(() => {
    vi.clearAllMocks()
    store = configureStore({
      reducer: {
        featureFlags: featureFlagsReducer,
      },
      preloadedState: {
        featureFlags: {
          byCode: { sms_notifications: true, dashboard: false },
          flagsList: [],
          tenantId: 'tenant-123',
          loading: false,
          synced: true,
        },
      },
    })
  })

  const wrapper = ({ children }: { children: ReactNode }) => {
    return <Provider store={store}>{children}</Provider>
  }

  describe('useFeatureFlag', () => {
    it('should return feature flag status from store', () => {
      const { result } = renderHook(() => useFeatureFlag('sms_notifications'), { wrapper })

      expect(result.current).toBe(true)
    })

    it('should return false for missing feature', () => {
      const { result } = renderHook(() => useFeatureFlag('non_existent'), { wrapper })

      expect(result.current).toBe(false)
    })

    it('should fetch flags if not synced', async () => {
      const newStore = configureStore({
        reducer: {
          featureFlags: featureFlagsReducer,
        },
        preloadedState: {
          featureFlags: {
            byCode: {},
            flagsList: [],
            loading: false,
            synced: false,
          },
        },
      })

      ;(globalThis.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ sms_notifications: true, dashboard: false }),
      })

      const newWrapper = ({ children }: { children: ReactNode }) => (
        <Provider store={newStore}>{children}</Provider>
      )

      const { result } = renderHook(() => useFeatureFlag('sms_notifications'), {
        wrapper: newWrapper,
      })

      await waitFor(() => {
        expect(result.current).toBe(true)
      })
    })
  })

  describe('useFeatureFlags', () => {
    it('should return multiple feature flags', () => {
      const { result } = renderHook(() => useFeatureFlags(['sms_notifications', 'dashboard']), {
        wrapper,
      })

      expect(result.current).toEqual({
        sms_notifications: true,
        dashboard: false,
      })
    })

    it('should return false for missing flags', () => {
      const { result } = renderHook(() => useFeatureFlags(['sms_notifications', 'non_existent']), {
        wrapper,
      })

      expect(result.current).toEqual({
        sms_notifications: true,
        non_existent: false,
      })
    })
  })

  describe('useFeatureFlagWithStatus', () => {
    it('should return flag with status information', () => {
      const { result } = renderHook(() => useFeatureFlagWithStatus('sms_notifications'), {
        wrapper,
      })

      expect(result.current).toEqual({
        enabled: true,
        loading: false,
        error: undefined,
      })
    })

    it('should return loading state', () => {
      const loadingStore = configureStore({
        reducer: {
          featureFlags: featureFlagsReducer,
        },
        preloadedState: {
          featureFlags: {
            byCode: {},
            flagsList: [],
            loading: true,
            synced: false,
          },
        },
      })

      const newWrapper = ({ children }: { children: ReactNode }) => (
        <Provider store={loadingStore}>{children}</Provider>
      )

      const { result } = renderHook(() => useFeatureFlagWithStatus('sms_notifications'), {
        wrapper: newWrapper,
      })

      expect(result.current.loading).toBe(true)
    })

    it('should return error state', () => {
      const errorStore = configureStore({
        reducer: {
          featureFlags: featureFlagsReducer,
        },
        preloadedState: {
          featureFlags: {
            byCode: { sms_notifications: false },
            flagsList: [],
            loading: false,
            synced: false,
            error: 'Failed to fetch flags',
          },
        },
      })

      const newWrapper = ({ children }: { children: ReactNode }) => (
        <Provider store={errorStore}>{children}</Provider>
      )

      const { result } = renderHook(() => useFeatureFlagWithStatus('sms_notifications'), {
        wrapper: newWrapper,
      })

      expect(result.current.error).toBe('Failed to fetch flags')
    })
  })

  describe('useFeatureFlagTenantChange', () => {
    it('should mark flags out of sync when tenant changes', async () => {
      const { rerender } = renderHook(
        ({ tenantId }: { tenantId: string }) => useFeatureFlagTenantChange(tenantId),
        {
          wrapper,
          initialProps: { tenantId: 'tenant-123' },
        },
      )

      // Change tenant
      rerender({ tenantId: 'tenant-456' })

      await waitFor(() => {
        const state = (store.getState() as any).featureFlags
        expect(state.synced).toBe(false)
      })
    })

    it('should not mark out of sync when tenant stays the same', () => {
      renderHook(() => useFeatureFlagTenantChange('tenant-123'), {
        wrapper,
      })

      expect((store.getState() as any).featureFlags.synced).toBe(true)
    })
  })
})
