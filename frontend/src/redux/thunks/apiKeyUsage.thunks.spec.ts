import { beforeEach, describe, it, expect, vi } from 'vitest'
import * as api from '@/api/apiKeyUsage.api'
import {
  fetchApiKeyUsage,
  fetchApiKeyUsageHistory,
  fetchAllTenantsUsage,
  updateTenantLimits,
  updateThreshold,
} from './apiKeyUsage.thunks'
import type { RootState } from '../store'
vi.mock('@/api/apiKeyUsage.api', () => ({
  getApiKeyUsage: vi.fn(),
  getApiKeyUsageHistory: vi.fn(),
  getAllTenantsUsage: vi.fn(),
  updateTenantLimits: vi.fn(),
  updateApiKeyThreshold: vi.fn(),
}))
const dispatch = vi.fn()
const state = {
  tenant: { selectedTenant: { id: 'tenant' } },
  apiKeyUsage: { adminPage: 2, adminLimit: 30, adminSearch: 'Ministry' },
} as RootState
beforeEach(() => vi.clearAllMocks())
describe('apiKeyUsage thunks', () => {
  it('fetchApiKeyUsage returns results and readable errors', async () => {
    vi.mocked(api.getApiKeyUsage).mockResolvedValue({ id: 'response' } as never)
    let result = await fetchApiKeyUsage(undefined)(dispatch, () => state, undefined)
    expect(result.meta.requestStatus).toBe('fulfilled')
    expect(result.payload).toEqual({ id: 'response' })
    for (const error of [new Error('Offline'), {}]) {
      vi.mocked(api.getApiKeyUsage).mockRejectedValue(error)
      result = await fetchApiKeyUsage(undefined)(dispatch, () => state, undefined)
      expect(result.meta.requestStatus).toBe('rejected')
      expect(result.payload).toEqual(
        error instanceof Error ? 'Offline' : expect.stringMatching(/^Failed/),
      )
    }
  })
  it('fetchApiKeyUsageHistory returns results and readable errors', async () => {
    vi.mocked(api.getApiKeyUsageHistory).mockResolvedValue({ id: 'response' } as never)
    let result = await fetchApiKeyUsageHistory(undefined)(dispatch, () => state, undefined)
    expect(result.meta.requestStatus).toBe('fulfilled')
    expect(result.payload).toEqual({ id: 'response' })
    for (const error of [new Error('Offline'), {}]) {
      vi.mocked(api.getApiKeyUsageHistory).mockRejectedValue(error)
      result = await fetchApiKeyUsageHistory(undefined)(dispatch, () => state, undefined)
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
    expect((await fetchApiKeyUsage()(dispatch, getState, undefined)).payload).toEqual({
      tenantId: '',
      fiscalYearStart: '',
      channels: [],
    })
    expect((await fetchApiKeyUsageHistory()(dispatch, getState, undefined)).payload).toEqual([])
    expect(api.getApiKeyUsage).not.toHaveBeenCalled()
    expect(api.getApiKeyUsageHistory).not.toHaveBeenCalled()
  })
  it('forwards committed pagination and omits empty searches', async () => {
    await fetchAllTenantsUsage()(dispatch, () => state, undefined)
    expect(api.getAllTenantsUsage).toHaveBeenCalledWith(2, 30, 'Ministry')
    await fetchAllTenantsUsage()(
      dispatch,
      () => ({ ...state, apiKeyUsage: { ...state.apiKeyUsage, adminSearch: '' } }),
      undefined,
    )
    expect(api.getAllTenantsUsage).toHaveBeenLastCalledWith(2, 30, undefined)
  })
})
