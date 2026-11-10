import { beforeEach, describe, it, expect, vi } from 'vitest'
import * as api from '@/api/apiKeys.api'
import { fetchApiKeys, issueApiKey, regenerateApiKey, updateApiKeyNotes } from './apiKeys.thunks'
import type { RootState } from '../store'
vi.mock('@/api/apiKeys.api', () => ({
  getApiKeys: vi.fn(),
  issueApiKey: vi.fn(),
  regenerateApiKey: vi.fn(),
  updateApiKeyNotes: vi.fn(),
}))
const dispatch = vi.fn()
const state = {
  tenant: { selectedTenant: { id: 'tenant' } },
  apiKeyUsage: { adminPage: 2, adminLimit: 30, adminSearch: 'Ministry' },
} as RootState
beforeEach(() => vi.clearAllMocks())
describe('apiKeys thunks', () => {
  it('fetchApiKeys returns results and readable errors', async () => {
    vi.mocked(api.getApiKeys).mockResolvedValue({ id: 'response' } as never)
    let result = await fetchApiKeys(undefined)(dispatch, () => state, undefined)
    expect(result.meta.requestStatus).toBe('fulfilled')
    expect(result.payload).toEqual({ id: 'response' })
    for (const error of [new Error('Offline'), {}]) {
      vi.mocked(api.getApiKeys).mockRejectedValue(error)
      result = await fetchApiKeys(undefined)(dispatch, () => state, undefined)
      expect(result.meta.requestStatus).toBe('rejected')
      expect(result.payload).toEqual(
        error instanceof Error ? 'Offline' : expect.stringMatching(/^Failed/),
      )
    }
  })
  it('issueApiKey returns results and readable errors', async () => {
    vi.mocked(api.issueApiKey).mockResolvedValue({ id: 'response' } as never)
    let result = await issueApiKey('notes')(dispatch, () => state, undefined)
    expect(result.meta.requestStatus).toBe('fulfilled')
    expect(result.payload).toEqual({ id: 'response' })
    for (const error of [new Error('Offline'), {}]) {
      vi.mocked(api.issueApiKey).mockRejectedValue(error)
      result = await issueApiKey('notes')(dispatch, () => state, undefined)
      expect(result.meta.requestStatus).toBe('rejected')
      expect(result.payload).toEqual(
        error instanceof Error ? 'Offline' : expect.stringMatching(/^Failed/),
      )
    }
  })
  it('regenerateApiKey returns results and readable errors', async () => {
    vi.mocked(api.regenerateApiKey).mockResolvedValue({ id: 'response' } as never)
    let result = await regenerateApiKey('client')(dispatch, () => state, undefined)
    expect(result.meta.requestStatus).toBe('fulfilled')
    expect(result.payload).toEqual({ id: 'response' })
    for (const error of [new Error('Offline'), {}]) {
      vi.mocked(api.regenerateApiKey).mockRejectedValue(error)
      result = await regenerateApiKey('client')(dispatch, () => state, undefined)
      expect(result.meta.requestStatus).toBe('rejected')
      expect(result.payload).toEqual(
        error instanceof Error ? 'Offline' : expect.stringMatching(/^Failed/),
      )
    }
  })
  it('updateApiKeyNotes returns results and readable errors', async () => {
    vi.mocked(api.updateApiKeyNotes).mockResolvedValue({ id: 'response' } as never)
    let result = await updateApiKeyNotes({ clientId: 'client', notes: null })(
      dispatch,
      () => state,
      undefined,
    )
    expect(result.meta.requestStatus).toBe('fulfilled')
    expect(result.payload).toEqual({ id: 'response' })
    for (const error of [new Error('Offline'), {}]) {
      vi.mocked(api.updateApiKeyNotes).mockRejectedValue(error)
      result = await updateApiKeyNotes({ clientId: 'client', notes: null })(
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
  it('skips key loading when no tenant is selected', async () => {
    const result = await fetchApiKeys()(
      dispatch,
      () => ({ ...state, tenant: { selectedTenant: null, showTenantModal: false } }),
      undefined,
    )
    expect(result.payload).toEqual([])
    expect(api.getApiKeys).not.toHaveBeenCalled()
  })
})
