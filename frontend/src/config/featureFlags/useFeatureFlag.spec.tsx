import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { http, HttpResponse } from 'msw'
import React from 'react'
import { server } from '@/test-setup'
import featureFlagsReducer from '@/redux/slices/featureFlags.slice'
import {
  useFeatureFlag,
  useFeatureFlags,
  useFeatureFlagWithStatus,
  useFeatureFlagTenantChange,
} from './useFeatureFlag'
import type { ReactNode } from 'react'

describe('useFeatureFlag hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    server.resetHandlers()
  })

  const wrapper = ({ children }: { children: ReactNode }) => {
    const testStore = configureStore({
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
    return <Provider store={testStore}>{children}</Provider>
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
      server.use(
        http.get('*/api/v1/frontend/feature-flags', () => {
          return HttpResponse.json({ sms_notifications: true, dashboard: false })
        }),
      )

      const newStore = configureStore({
        reducer: {
          featureFlags: featureFlagsReducer,
        },
        preloadedState: {
          featureFlags: {
            byCode: {},
            flagsList: [],
            tenantId: undefined,
            loading: false,
            synced: false,
          },
        },
      })

      const newWrapper = ({ children }: { children: ReactNode }) => (
        <Provider store={newStore}>{children}</Provider>
      )

      const { result } = renderHook(() => useFeatureFlag('sms_notifications', 'tenant-123'), {
        wrapper: newWrapper,
      })

      // Initially should be false because not synced yet
      expect(result.current).toBe(false)

      // After fetch completes, should be true
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

    it('should return error state', async () => {
      const errorStore = configureStore({
        reducer: {
          featureFlags: featureFlagsReducer,
        },
        preloadedState: {
          featureFlags: {
            byCode: { sms_notifications: false },
            flagsList: [],
            tenantId: 'tenant-123',
            loading: false,
            synced: true, // Set to true so it won't try to fetch again
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
      const tenantStore = configureStore({
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

      const tenantWrapper = ({ children }: { children: ReactNode }) => (
        <Provider store={tenantStore}>{children}</Provider>
      )

      const { rerender } = renderHook(
        ({ tenantId }: { tenantId: string }) => useFeatureFlagTenantChange(tenantId),
        {
          wrapper: tenantWrapper,
          initialProps: { tenantId: 'tenant-123' },
        },
      )

      // Change tenant
      rerender({ tenantId: 'tenant-456' })

      await waitFor(() => {
        const state = (tenantStore.getState() as any).featureFlags
        expect(state.synced).toBe(false)
      })
    })

    it('should not mark out of sync when tenant stays the same', () => {
      const tenantStore = configureStore({
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

      const tenantWrapper = ({ children }: { children: ReactNode }) => (
        <Provider store={tenantStore}>{children}</Provider>
      )

      renderHook(() => useFeatureFlagTenantChange('tenant-123'), {
        wrapper: tenantWrapper,
      })

      expect((tenantStore.getState() as any).featureFlags.synced).toBe(true)
    })
  })
})
