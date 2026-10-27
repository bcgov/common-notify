import { describe, it, expect } from 'vitest'
import reducer, { setAdminPage, setAdminLimit, setAdminSearch } from './apiKeyUsage.slice'
import {
  fetchApiKeyUsage,
  fetchApiKeyUsageHistory,
  fetchAllTenantsUsage,
  updateTenantLimits,
  updateThreshold,
} from '../thunks/apiKeyUsage.thunks'

describe('apiKeyUsage request lifecycle', () => {
  it('fetchApiKeyUsage starts and reports rejected requests', () => {
    const pending = reducer(undefined, {
      type: fetchApiKeyUsage.pending.type,
      meta: { requestId: 'request', arg: undefined },
    })
    expect(pending.isLoading).toBeTruthy()
    const failed = reducer(pending, {
      type: fetchApiKeyUsage.rejected.type,
      payload: 'Server unavailable',
      meta: { requestId: 'request', arg: undefined },
    })
    expect(failed.isLoading).toBeFalsy()
    expect(failed.error).toBe('Server unavailable')
    const fallback = reducer(pending, {
      type: fetchApiKeyUsage.rejected.type,
      meta: { requestId: 'request', arg: undefined },
    })
    expect(fallback.error).toMatch(/Failed/)
  })
  it('fetchApiKeyUsageHistory starts and reports rejected requests', () => {
    const pending = reducer(undefined, {
      type: fetchApiKeyUsageHistory.pending.type,
      meta: { requestId: 'request', arg: undefined },
    })
    expect(pending.historyLoading).toBeTruthy()
    const failed = reducer(pending, {
      type: fetchApiKeyUsageHistory.rejected.type,
      payload: 'Server unavailable',
      meta: { requestId: 'request', arg: undefined },
    })
    expect(failed.historyLoading).toBeFalsy()
    expect(failed.historyError).toBe('Server unavailable')
    const fallback = reducer(pending, {
      type: fetchApiKeyUsageHistory.rejected.type,
      meta: { requestId: 'request', arg: undefined },
    })
    expect(fallback.historyError).toMatch(/Failed/)
  })
  it('fetchAllTenantsUsage starts and reports rejected requests', () => {
    const pending = reducer(undefined, {
      type: fetchAllTenantsUsage.pending.type,
      meta: { requestId: 'request', arg: undefined },
    })
    expect(pending.adminLoading).toBeTruthy()
    const failed = reducer(pending, {
      type: fetchAllTenantsUsage.rejected.type,
      payload: 'Server unavailable',
      meta: { requestId: 'request', arg: undefined },
    })
    expect(failed.adminLoading).toBeFalsy()
    expect(failed.adminError).toBe('Server unavailable')
    const fallback = reducer(pending, {
      type: fetchAllTenantsUsage.rejected.type,
      meta: { requestId: 'request', arg: undefined },
    })
    expect(fallback.adminError).toMatch(/Failed/)
  })
  it('updateTenantLimits starts and reports rejected requests', () => {
    const pending = reducer(undefined, {
      type: updateTenantLimits.pending.type,
      meta: {
        requestId: 'request',
        arg: { tenantId: 'tenant', channel: 'EMAIL', dailyLimit: 10, annualLimit: 100 },
      },
    })
    expect(pending.adminUpdatingKey).toBeTruthy()
    const failed = reducer(pending, {
      type: updateTenantLimits.rejected.type,
      payload: 'Server unavailable',
      meta: {
        requestId: 'request',
        arg: { tenantId: 'tenant', channel: 'EMAIL', dailyLimit: 10, annualLimit: 100 },
      },
    })
    expect(failed.adminUpdatingKey).toBeFalsy()
    expect(failed.adminUpdateError).toBe('Server unavailable')
    const fallback = reducer(pending, {
      type: updateTenantLimits.rejected.type,
      meta: {
        requestId: 'request',
        arg: { tenantId: 'tenant', channel: 'EMAIL', dailyLimit: 10, annualLimit: 100 },
      },
    })
    expect(fallback.adminUpdateError).toMatch(/Failed/)
  })
  it('updateThreshold starts and reports rejected requests', () => {
    const pending = reducer(undefined, {
      type: updateThreshold.pending.type,
      meta: { requestId: 'request', arg: { channel: 'EMAIL', warnThresholdPercent: 60 } },
    })
    expect(pending.updatingChannel).toBeTruthy()
    const failed = reducer(pending, {
      type: updateThreshold.rejected.type,
      payload: 'Server unavailable',
      meta: { requestId: 'request', arg: { channel: 'EMAIL', warnThresholdPercent: 60 } },
    })
    expect(failed.updatingChannel).toBeFalsy()
    expect(failed.updateError).toBe('Server unavailable')
    const fallback = reducer(pending, {
      type: updateThreshold.rejected.type,
      meta: { requestId: 'request', arg: { channel: 'EMAIL', warnThresholdPercent: 60 } },
    })
    expect(fallback.updateError).toMatch(/Failed/)
  })
})

describe('usage results', () => {
  it('clamps pages and resets pagination for new limits and searches', () => {
    expect(reducer(undefined, setAdminPage(-1)).adminPage).toBe(1)
    const state = reducer(undefined, setAdminPage(4))
    expect(reducer(state, setAdminLimit(30))).toMatchObject({ adminPage: 1, adminLimit: 30 })
    expect(reducer(state, setAdminSearch('Health'))).toMatchObject({
      adminPage: 1,
      adminSearch: 'Health',
    })
  })
  const row = { tenantId: 'tenant', channel: 'EMAIL', warnThresholdPercent: 80 }
  const usage = { tenantId: 'tenant', channels: [row] }
  it.each([
    [fetchApiKeyUsage, usage, 'usage'],
    [fetchApiKeyUsageHistory, [row], 'history'],
    [
      fetchAllTenantsUsage,
      { data: [row], count: 1, page: 2, limit: 15, totalPages: 2 },
      'adminRows',
    ],
  ])('ignores stale fetches and accepts current results', (thunk, payload, key) => {
    const pending = reducer(undefined, { type: thunk.pending.type, meta: { requestId: 'current' } })
    expect(
      reducer(pending, { type: thunk.fulfilled.type, payload, meta: { requestId: 'old' } }),
    ).toEqual(pending)
    expect(
      reducer(pending, { type: thunk.rejected.type, payload: 'stale', meta: { requestId: 'old' } }),
    ).toEqual(pending)
    const result = reducer(pending, {
      type: thunk.fulfilled.type,
      payload,
      meta: { requestId: 'current' },
    })
    expect(result[key as keyof typeof result]).toEqual(key === 'adminRows' ? [row] : payload)
  })
  it('merges limit updates by tenant and channel', () => {
    const initial = reducer(undefined, { type: 'init' })
    const state = { ...initial, adminRows: [row, { ...row, tenantId: 'other' }] } as typeof initial
    const updated = reducer(state, {
      type: updateTenantLimits.fulfilled.type,
      payload: [{ ...row, warnThresholdPercent: 50 }],
    })
    expect(updated.adminRows.map((item) => item.warnThresholdPercent)).toEqual([50, 80])
    expect(updated.adminUpdatingKey).toBeNull()
    expect(
      reducer(undefined, { type: updateThreshold.fulfilled.type, payload: usage }).usage,
    ).toEqual(usage)
  })
})
