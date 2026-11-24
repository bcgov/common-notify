import { beforeEach, describe, it, expect, vi } from 'vitest'
import * as api from '@/api/usage.api'
import {
  fetchTenantUsage,
  fetchTenantUsageHistory,
  fetchAllTenantsUsage,
  updateTenantLimits,
  updateThreshold,
} from './usage.thunks'
import type { RootState } from '../store'
vi.mock('@/api/usage.api', () => ({
  getTenantUsage: vi.fn(),
  getTenantUsageHistory: vi.fn(),
  getAllTenantsUsage: vi.fn(),
  updateTenantLimits: vi.fn(),
  updateApiKeyThreshold: vi.fn(),
}))
const dispatch = vi.fn()
const state = {
  tenant: { selectedTenant: { id: 'tenant' } },
  usage: { adminPage: 2, adminLimit: 30, adminSearch: 'Ministry', adminFilters: {} },
} as RootState
beforeEach(() => vi.clearAllMocks())
describe('usage thunks', () => {
  it('fetchTenantUsage returns results and readable errors', async () => {
    vi.mocked(api.getTenantUsage).mockResolvedValue({ id: 'response' } as never)
    let result = await fetchTenantUsage(undefined)(dispatch, () => state, undefined)
    expect(result.meta.requestStatus).toBe('fulfilled')
    expect(result.payload).toEqual({ id: 'response' })
    for (const error of [new Error('Offline'), {}]) {
      vi.mocked(api.getTenantUsage).mockRejectedValue(error)
      result = await fetchTenantUsage(undefined)(dispatch, () => state, undefined)
      expect(result.meta.requestStatus).toBe('rejected')
      expect(result.payload).toEqual(
        error instanceof Error ? 'Offline' : expect.stringMatching(/^Failed/),
      )
    }
  })
  it('fetchTenantUsageHistory returns results and readable errors', async () => {
    vi.mocked(api.getTenantUsageHistory).mockResolvedValue({ id: 'response' } as never)
    let result = await fetchTenantUsageHistory(undefined)(dispatch, () => state, undefined)
    expect(result.meta.requestStatus).toBe('fulfilled')
    expect(result.payload).toEqual({ id: 'response' })
    for (const error of [new Error('Offline'), {}]) {
      vi.mocked(api.getTenantUsageHistory).mockRejectedValue(error)
      result = await fetchTenantUsageHistory(undefined)(dispatch, () => state, undefined)
      expect(result.meta.requestStatus).toBe('rejected')
      expect(result.payload).toEqual(
        error instanceof Error ? 'Offline' : expect.stringMatching(/^Failed/),
      )
    }
  })
  it('fetchAllTenantsUsage returns results and readable errors', async () => {
    vi.mocked(api.getAllTenantsUsage).mockResolvedValue({ id: 'response' } as never)
    let result = await fetchAllTenantsUsage(undefined)(dispatch, () => state, undefined)
    expect(result.meta.requestStatus).toBe('fulfilled')
    expect(result.payload).toEqual({ id: 'response' })
    for (const error of [new Error('Offline'), {}]) {
      vi.mocked(api.getAllTenantsUsage).mockRejectedValue(error)
      result = await fetchAllTenantsUsage(undefined)(dispatch, () => state, undefined)
      expect(result.meta.requestStatus).toBe('rejected')
      expect(result.payload).toEqual(
        error instanceof Error ? 'Offline' : expect.stringMatching(/^Failed/),
      )
    }
  })
  it('fetchAllTenantsUsage sends the sort, descending with a leading minus', async () => {
    vi.mocked(api.getAllTenantsUsage).mockResolvedValue({ id: 'response' } as never)
    const sorted = {
      ...state,
      usage: { ...state.usage, adminSortBy: 'usedThisYear', adminSortOrder: 'desc' },
    } as RootState
    await fetchAllTenantsUsage(undefined)(dispatch, () => sorted, undefined)
    expect(api.getAllTenantsUsage).toHaveBeenLastCalledWith(
      2,
      30,
      'Ministry',
      undefined,
      '-usedThisYear',
    )

    await fetchAllTenantsUsage(undefined)(dispatch, () => state, undefined)
    expect(api.getAllTenantsUsage).toHaveBeenLastCalledWith(2, 30, 'Ministry', undefined, undefined)
  })
  it('updateTenantLimits returns results and readable errors', async () => {
    vi.mocked(api.updateTenantLimits).mockResolvedValue({ id: 'response' } as never)
    let result = await updateTenantLimits({
      tenantId: 'tenant',
      channel: 'SMS',
      dailyLimit: 10,
      annualLimit: 100,
    })(dispatch, () => state, undefined)
    expect(result.meta.requestStatus).toBe('fulfilled')
    expect(result.payload).toEqual({ id: 'response' })
    for (const error of [new Error('Offline'), {}]) {
      vi.mocked(api.updateTenantLimits).mockRejectedValue(error)
      result = await updateTenantLimits({
        tenantId: 'tenant',
        channel: 'SMS',
        dailyLimit: 10,
        annualLimit: 100,
      })(dispatch, () => state, undefined)
      expect(result.meta.requestStatus).toBe('rejected')
      expect(result.payload).toEqual(
        error instanceof Error ? 'Offline' : expect.stringMatching(/^Failed/),
      )
    }
  })
  it('updateThreshold returns results and readable errors', async () => {
    vi.mocked(api.updateApiKeyThreshold).mockResolvedValue({ id: 'response' } as never)
    let result = await updateThreshold({ channel: 'SMS', warnThresholdPercent: 60 })(
      dispatch,
      () => state,
      undefined,
    )
    expect(result.meta.requestStatus).toBe('fulfilled')
    expect(result.payload).toEqual({ id: 'response' })
    for (const error of [new Error('Offline'), {}]) {
      vi.mocked(api.updateApiKeyThreshold).mockRejectedValue(error)
      result = await updateThreshold({ channel: 'SMS', warnThresholdPercent: 60 })(
        dispatch,
        () => state,
        undefined,
      )
      expect(result.meta.requestStatus).toBe('rejected')
      expect(result.payload).toEqual(
        error instanceof Error ? 'Offline' : expect.stringMatching(/^Failed/),
      )
    }
  })
  it('does not request tenant usage or history without tenant context', async () => {
    const getState = () => ({ ...state, tenant: { selectedTenant: null, showTenantModal: false } })
    expect((await fetchTenantUsage()(dispatch, getState, undefined)).payload).toEqual({
      tenantId: '',
      fiscalYearStart: '',
      channels: [],
    })
    expect((await fetchTenantUsageHistory()(dispatch, getState, undefined)).payload).toEqual([])
    expect(api.getTenantUsage).not.toHaveBeenCalled()
    expect(api.getTenantUsageHistory).not.toHaveBeenCalled()
  })
  it('forwards committed pagination and omits empty searches', async () => {
    await fetchAllTenantsUsage()(dispatch, () => state, undefined)
    expect(api.getAllTenantsUsage).toHaveBeenCalledWith(2, 30, 'Ministry', undefined, undefined)
    await fetchAllTenantsUsage()(
      dispatch,
      () => ({ ...state, usage: { ...state.usage, adminSearch: '' } }),
      undefined,
    )
    expect(api.getAllTenantsUsage).toHaveBeenLastCalledWith(2, 30, undefined, undefined, undefined)
  })
  it('forwards the committed channel filter', async () => {
    await fetchAllTenantsUsage()(
      dispatch,
      () => ({
        ...state,
        usage: { ...state.usage, adminFilters: { channel: ['SMS'] } },
      }),
      undefined,
    )
    expect(api.getAllTenantsUsage).toHaveBeenCalledWith(
      2,
      30,
      'Ministry',
      ['channel:in:SMS'],
      undefined,
    )
  })
})
