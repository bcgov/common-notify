import { beforeEach, describe, it, expect, vi } from 'vitest'
import * as api from './apiKeys.api'
import { get, patch, post } from '@/common/api'
vi.mock('@/common/api', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, get: vi.fn(), patch: vi.fn(), post: vi.fn() }
})
beforeEach(() => {
  vi.clearAllMocks()
  for (const method of [get, patch, post]) vi.mocked(method).mockResolvedValue({ ok: true })
})
describe('apiKeys API', () => {
  it('getApiKeys returns results and translates failures', async () => {
    const invoke = () => api.getApiKeys()
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
  it('issueApiKey returns results and translates failures', async () => {
    const invoke = () => api.issueApiKey()
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
  it('regenerateApiKey returns results and translates failures', async () => {
    const invoke = () => api.regenerateApiKey('client/id')
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
  it('updateApiKeyNotes returns results and translates failures', async () => {
    const invoke = () => api.updateApiKeyNotes('client/id', null)
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
  it('encodes client IDs and puts notes in the request body', async () => {
    await api.issueApiKey('description')
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ data: { notes: 'description' } }))
    await api.regenerateApiKey('client/id')
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/frontend/api-keys/client%2Fid/regenerate',
        data: {},
      }),
    )
    await api.updateApiKeyNotes('client/id', null)
    expect(patch).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/frontend/api-keys/client%2Fid',
        params: { notes: null },
      }),
    )
  })
  it.each([
    [409, 'This tenant already has an API key'],
    [503, 'The API gateway is unavailable right now. Please try again shortly.'],
  ])('provides a fallback message for status %s', async (status, message) => {
    vi.mocked(get).mockRejectedValue({ response: { status } })
    await expect(api.getApiKeys()).rejects.toThrow(String(message))
  })
})
