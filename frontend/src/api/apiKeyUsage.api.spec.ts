import { beforeEach, describe, it, expect, vi } from 'vitest'
import * as api from './apiKeyUsage.api'
import { get, patch, post } from '@/common/api'
vi.mock('@/common/api', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, get: vi.fn(), patch: vi.fn(), post: vi.fn() }
})
beforeEach(() => {
  vi.clearAllMocks()
  for (const method of [get, patch, post]) vi.mocked(method).mockResolvedValue({ ok: true })
})
describe('apiKeyUsage API', () => {
  it('getApiKeyUsage returns results and translates failures', async () => {
    const invoke = () => api.getApiKeyUsage()
    await expect(invoke()).resolves.toEqual({ ok: true })
    for (const status of [401, 403, 409, 503, 500]) {
      for (const method of [get, patch, post])
        vi.mocked(method).mockRejectedValue({
          response: { status, data: { message: 'Server message' } },
        })
      await expect(invoke()).rejects.toThrow(
        status === 401 || status === 403 ? /permission|authorized/ : /Server message/,
      )
    }
    for (const error of [new Error('Network unavailable'), {}]) {
      for (const method of [get, patch, post]) vi.mocked(method).mockRejectedValue(error)
      await expect(invoke()).rejects.toThrow(
        error instanceof Error ? /Network unavailable/ : /Unknown error/,
      )
    }
  })
  it('getApiKeyUsageHistory returns results and translates failures', async () => {
    const invoke = () => api.getApiKeyUsageHistory()
    await expect(invoke()).resolves.toEqual({ ok: true })
    for (const status of [401, 403, 409, 503, 500]) {
      for (const method of [get, patch, post])
        vi.mocked(method).mockRejectedValue({
          response: { status, data: { message: 'Server message' } },
        })
      await expect(invoke()).rejects.toThrow(
        status === 401 || status === 403 ? /permission|authorized/ : /Server message/,
      )
    }
    for (const error of [new Error('Network unavailable'), {}]) {
      for (const method of [get, patch, post]) vi.mocked(method).mockRejectedValue(error)
      await expect(invoke()).rejects.toThrow(
        error instanceof Error ? /Network unavailable/ : /Unknown error/,
      )
    }
  })
  it('getAllTenantsUsage returns results and translates failures', async () => {
    const invoke = () => api.getAllTenantsUsage()
    await expect(invoke()).resolves.toEqual({ ok: true })
    for (const status of [401, 403, 409, 503, 500]) {
      for (const method of [get, patch, post])
        vi.mocked(method).mockRejectedValue({
          response: { status, data: { message: 'Server message' } },
        })
      await expect(invoke()).rejects.toThrow(
        status === 401 || status === 403 ? /permission|authorized/ : /Server message/,
      )
    }
    for (const error of [new Error('Network unavailable'), {}]) {
      for (const method of [get, patch, post]) vi.mocked(method).mockRejectedValue(error)
      await expect(invoke()).rejects.toThrow(
        error instanceof Error ? /Network unavailable/ : /Unknown error/,
      )
    }
  })
  it('updateApiKeyThreshold returns results and translates failures', async () => {
    const invoke = () => api.updateApiKeyThreshold({ channel: 'EMAIL', warnThresholdPercent: 75 })
    await expect(invoke()).resolves.toEqual({ ok: true })
    for (const status of [401, 403, 409, 503, 500]) {
      for (const method of [get, patch, post])
        vi.mocked(method).mockRejectedValue({
          response: { status, data: { message: 'Server message' } },
        })
      await expect(invoke()).rejects.toThrow(
        status === 401 || status === 403 ? /permission|authorized/ : /Server message/,
      )
    }
    for (const error of [new Error('Network unavailable'), {}]) {
      for (const method of [get, patch, post]) vi.mocked(method).mockRejectedValue(error)
      await expect(invoke()).rejects.toThrow(
        error instanceof Error ? /Network unavailable/ : /Unknown error/,
      )
    }
  })
  it('updateTenantLimits returns results and translates failures', async () => {
    const invoke = () =>
      api.updateTenantLimits({
        tenantId: 'tenant',
        channel: 'EMAIL',
        dailyLimit: 10,
        annualLimit: 100,
      })
    await expect(invoke()).resolves.toEqual({ ok: true })
    for (const status of [401, 403, 409, 503, 500]) {
      for (const method of [get, patch, post])
        vi.mocked(method).mockRejectedValue({
          response: { status, data: { message: 'Server message' } },
        })
      await expect(invoke()).rejects.toThrow(
        status === 401 || status === 403 ? /permission|authorized/ : /Server message/,
      )
    }
    for (const error of [new Error('Network unavailable'), {}]) {
      for (const method of [get, patch, post]) vi.mocked(method).mockRejectedValue(error)
      await expect(invoke()).rejects.toThrow(
        error instanceof Error ? /Network unavailable/ : /Unknown error/,
      )
    }
  })
  it('serializes admin pagination, nonempty searches and each filter', async () => {
    const lastQuery = () => {
      const { url } = vi.mocked(get).mock.lastCall![0] as { url: string }
      return [...new URL(url, 'http://localhost').searchParams.entries()]
    }
    await api.getAllTenantsUsage(2, 30, 'Ministry')
    expect(lastQuery()).toEqual([
      ['page', '2'],
      ['limit', '30'],
      ['search', 'Ministry'],
    ])
    await api.getAllTenantsUsage()
    expect(lastQuery()).toEqual([
      ['page', '1'],
      ['limit', '15'],
    ])
    await api.getAllTenantsUsage(1, 15, undefined, ['channel:in:EMAIL|SMS', 'status:in:x'])
    expect(lastQuery()).toEqual([
      ['page', '1'],
      ['limit', '15'],
      ['filter', 'channel:in:EMAIL|SMS'],
      ['filter', 'status:in:x'],
    ])
    await api.getAllTenantsUsage(1, 15, undefined, undefined, '-usedToday')
    expect(lastQuery()).toEqual([
      ['page', '1'],
      ['limit', '15'],
      ['sort', '-usedToday'],
    ])
  })
  it('getAdminUsageSummary reads the summary endpoint and translates failures', async () => {
    await expect(api.getAdminUsageSummary()).resolves.toEqual({ ok: true })
    expect(vi.mocked(get).mock.lastCall![0]).toMatchObject({
      url: '/api/v1/frontend/admin/api-key-usage/summary',
    })
    vi.mocked(get).mockRejectedValue({ response: { status: 500, data: { message: 'down' } } })
    await expect(api.getAdminUsageSummary()).rejects.toThrow('Failed to load tenant summary: down')
  })
  it('setTenantSending sends the reason only when disabling', async () => {
    await api.setTenantSending('tenant 1', false, 'Unpaid invoice')
    expect(vi.mocked(patch).mock.lastCall![0]).toMatchObject({
      url: '/api/v1/frontend/admin/api-key-usage/tenants/tenant%201/sending',
      params: { enabled: false, reason: 'Unpaid invoice' },
    })
    await api.setTenantSending('tenant-1', true, 'ignored')
    expect(vi.mocked(patch).mock.lastCall![0]).toMatchObject({ params: { enabled: true } })
    expect(vi.mocked(patch).mock.lastCall![0]).not.toHaveProperty('params.reason')
  })
  it("surfaces the server's message for any other failure", async () => {
    vi.mocked(get).mockRejectedValue(
      Object.assign(new Error('Request failed with status code 500'), {
        response: { status: 500, data: { message: 'database is down' } },
      }),
    )
    await expect(api.getApiKeyUsage()).rejects.toThrow('Failed to load usage: database is down')
  })
})
