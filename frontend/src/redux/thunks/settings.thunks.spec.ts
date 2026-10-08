import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSettings } from '@/api/settings.api'
import { getApiKeyUsage, type TenantUsageResponse } from '@/api/apiKeyUsage.api'
import tenantSettings from '../slices/tenantSettings.slice'
import apiKeyUsage from '../slices/apiKeyUsage.slice'
import { fetchSettings } from './settings.thunks'
import type { AppDispatch } from '../store'

vi.mock('@/api/settings.api', () => ({ getSettings: vi.fn() }))
vi.mock('@/api/apiKeyUsage.api', () => ({ getApiKeyUsage: vi.fn() }))

function usage(limits: number[], tenantId = 'tenant-1'): TenantUsageResponse {
  return {
    tenantId,
    fiscalYearStart: '2026-04-01',
    channels: limits.map((rateLimitPerMinute, index) => ({
      channel: index === 0 ? 'EMAIL' : 'SMS',
      rateLimitPerMinute,
      dailyLimit: 10000,
      annualLimit: 100000,
      warnThresholdPercent: 80,
      usedThisMinute: 0,
      usedToday: 0,
      usedThisYear: 0,
    })),
  }
}

function setupStore(cachedUsage: TenantUsageResponse | null = null) {
  const store = configureStore({
    reducer: {
      tenant: () => ({ selectedTenant: { id: 'tenant-1' } }),
      tenantSettings,
      apiKeyUsage,
    },
    preloadedState: {
      apiKeyUsage: { ...apiKeyUsage(undefined, { type: 'init' }), usage: cachedUsage },
    },
  })
  // This focused store includes every slice read or updated by the settings load.
  return { ...store, dispatch: store.dispatch as AppDispatch }
}

describe('fetchSettings rate limit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getSettings).mockResolvedValue(null)
  })

  it.each([
    [[1000, 750], { EMAIL: 1000, SMS: 750 }],
    [[0, 1000], { EMAIL: 0, SMS: 1000 }],
    [[], { EMAIL: null, SMS: null }],
  ])('loads limits %j even without a settings row', async (limits, expected) => {
    vi.mocked(getApiKeyUsage).mockResolvedValue(usage(limits as number[]))
    const store = setupStore()
    await store.dispatch(fetchSettings()).unwrap()
    expect(store.getState().tenantSettings.rateLimitPerMinute).toEqual(expected)
    expect(getSettings).toHaveBeenCalledTimes(1)
    expect(getApiKeyUsage).toHaveBeenCalledTimes(1)
  })

  it('reuses usage already loaded for the selected tenant', async () => {
    const store = setupStore(usage([750]))
    await store.dispatch(fetchSettings()).unwrap()
    expect(store.getState().tenantSettings.rateLimitPerMinute).toEqual({ EMAIL: 750, SMS: null })
    expect(getApiKeyUsage).not.toHaveBeenCalled()
  })

  it('does not reuse another tenant’s usage', async () => {
    const store = setupStore(usage([750], 'tenant-2'))
    vi.mocked(getApiKeyUsage).mockResolvedValue(usage([1000]))
    await store.dispatch(fetchSettings()).unwrap()
    expect(store.getState().tenantSettings.rateLimitPerMinute).toEqual({ EMAIL: 1000, SMS: null })
    expect(getApiKeyUsage).toHaveBeenCalledTimes(1)
  })

  it('rejects a failed usage load instead of showing no configured limit', async () => {
    const store = setupStore()
    vi.mocked(getApiKeyUsage).mockRejectedValue(new Error('Usage unavailable'))
    await expect(store.dispatch(fetchSettings()).unwrap()).rejects.toBe('Failed to load settings')
    expect(store.getState().tenantSettings.rateLimitPerMinute).toBeUndefined()
  })
})
