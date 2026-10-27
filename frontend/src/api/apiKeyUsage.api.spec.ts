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
  it('serializes admin pagination and includes only nonempty searches', async () => {
    await api.getAllTenantsUsage(2, 30, 'Ministry')
    expect(get).toHaveBeenCalledWith(
      expect.objectContaining({ params: { page: '2', limit: '30', search: 'Ministry' } }),
    )
    await api.getAllTenantsUsage()
    expect(get).toHaveBeenLastCalledWith(
      expect.objectContaining({ params: { page: '1', limit: '15' } }),
    )
  })
})
