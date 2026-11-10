import { describe, it, expect } from 'vitest'
import reducer from './apiKeys.slice'
import {
  fetchApiKeys,
  issueApiKey,
  regenerateApiKey,
  updateApiKeyNotes,
} from '../thunks/apiKeys.thunks'

describe('apiKeys request lifecycle', () => {
  it('fetchApiKeys starts and reports rejected requests', () => {
    const pending = reducer(undefined, {
      type: fetchApiKeys.pending.type,
      meta: { requestId: 'request', arg: undefined },
    })
    expect(pending.loading).toBeTruthy()
    const failed = reducer(pending, {
      type: fetchApiKeys.rejected.type,
      payload: 'Server unavailable',
      meta: { requestId: 'request', arg: undefined },
    })
    expect(failed.loading).toBeFalsy()
    expect(failed.error).toBe('Server unavailable')
    const fallback = reducer(pending, {
      type: fetchApiKeys.rejected.type,
      meta: { requestId: 'request', arg: undefined },
    })
    expect(fallback.error).toMatch(/Failed/)
  })
  it('issueApiKey starts and reports rejected requests', () => {
    const pending = reducer(undefined, {
      type: issueApiKey.pending.type,
      meta: { requestId: 'request', arg: undefined },
    })
    expect(pending.saving).toBeTruthy()
    const failed = reducer(pending, {
      type: issueApiKey.rejected.type,
      payload: 'Server unavailable',
      meta: { requestId: 'request', arg: undefined },
    })
    expect(failed.saving).toBeFalsy()
    expect(failed.error).toBe('Server unavailable')
    const fallback = reducer(pending, {
      type: issueApiKey.rejected.type,
      meta: { requestId: 'request', arg: undefined },
    })
    expect(fallback.error).toMatch(/Failed/)
  })
  it('regenerateApiKey starts and reports rejected requests', () => {
    const pending = reducer(undefined, {
      type: regenerateApiKey.pending.type,
      meta: { requestId: 'request', arg: { clientId: 'one' } },
    })
    expect(pending.saving).toBeTruthy()
    const failed = reducer(pending, {
      type: regenerateApiKey.rejected.type,
      payload: 'Server unavailable',
      meta: { requestId: 'request', arg: { clientId: 'one' } },
    })
    expect(failed.saving).toBeFalsy()
    expect(failed.error).toBe('Server unavailable')
    const fallback = reducer(pending, {
      type: regenerateApiKey.rejected.type,
      meta: { requestId: 'request', arg: { clientId: 'one' } },
    })
    expect(fallback.error).toMatch(/Failed/)
  })
  it('updateApiKeyNotes starts and reports rejected requests', () => {
    const pending = reducer(undefined, {
      type: updateApiKeyNotes.pending.type,
      meta: { requestId: 'request', arg: { clientId: 'one', notes: 'updated' } },
    })
    expect(pending.saving).toBeTruthy()
    const failed = reducer(pending, {
      type: updateApiKeyNotes.rejected.type,
      payload: 'Server unavailable',
      meta: { requestId: 'request', arg: { clientId: 'one', notes: 'updated' } },
    })
    expect(failed.saving).toBeFalsy()
    expect(failed.error).toBe('Server unavailable')
    const fallback = reducer(pending, {
      type: updateApiKeyNotes.rejected.type,
      meta: { requestId: 'request', arg: { clientId: 'one', notes: 'updated' } },
    })
    expect(fallback.error).toMatch(/Failed/)
  })
})

describe('API key storage', () => {
  const issued = {
    id: 'key',
    clientId: 'client',
    notes: null,
    issuedVia: 'self-service',
    activated: true,
    manageable: true,
    createdAt: '2026',
    apiKey: 'one-time-secret',
    flow: 'issue',
  }
  it('never stores the one-time secret on issue or rotation', () => {
    const state = reducer(undefined, { type: issueApiKey.fulfilled.type, payload: issued })
    expect(state.keys).toHaveLength(1)
    expect(state.keys[0]).not.toHaveProperty('apiKey')
    expect(state.keys[0]).not.toHaveProperty('flow')
    const rotated = reducer(state, {
      type: regenerateApiKey.fulfilled.type,
      payload: { ...issued, lastRegeneratedAt: 'today' },
    })
    expect(rotated.keys[0].lastRegeneratedAt).toBe('today')
    expect(rotated.keys[0]).not.toHaveProperty('apiKey')
  })
  it('updates matching notes without changing other keys', () => {
    const state = reducer(undefined, {
      type: fetchApiKeys.fulfilled.type,
      payload: [issued, { ...issued, clientId: 'other' }],
    })
    const updated = reducer(state, {
      type: updateApiKeyNotes.fulfilled.type,
      payload: { ...issued, notes: 'Updated' },
    })
    expect(updated.keys.map((key) => key.notes)).toEqual(['Updated', null])
    expect(reducer(state, { type: fetchApiKeys.pending.type }).keys).toEqual([])
  })
})
