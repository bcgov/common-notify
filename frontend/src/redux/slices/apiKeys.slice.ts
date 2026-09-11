import { createSlice } from '@reduxjs/toolkit'
import type { ApiKey } from '@/interfaces/api-key.interface'
import {
  fetchApiKeys,
  issueApiKey,
  regenerateApiKey,
  updateApiKeyNotes,
} from '../thunks/apiKeys.thunks'

interface ApiKeysState {
  /** Keys bound to the selected tenant. At most one today. */
  keys: ApiKey[]
  loading: boolean
  /** True while an issue, regenerate or notes write is in flight. */
  saving: boolean
  error?: string
}

const initialState: ApiKeysState = {
  keys: [],
  loading: false,
  saving: false,
}

/**
 * Replace a key in the list, matching on clientId.
 *
 * Regenerate and notes both return the same binding with one field changed, so this
 * keeps the list in step without a refetch.
 */
const replaceKey = (keys: ApiKey[], updated: ApiKey): ApiKey[] =>
  keys.map((key) => (key.clientId === updated.clientId ? { ...key, ...updated } : key))

/**
 * Strip the one-time value before anything reaches the store.
 *
 * Listing the fields explicitly rather than deleting `apiKey` from a copy means a new
 * secret-bearing field on the response cannot leak into the store by default.
 */
const toStoredKey = (issued: ApiKey): ApiKey => ({
  id: issued.id,
  clientId: issued.clientId,
  notes: issued.notes,
  issuedVia: issued.issuedVia,
  issuedAt: issued.issuedAt,
  lastRegeneratedAt: issued.lastRegeneratedAt,
  currentKeyCreatedAt: issued.currentKeyCreatedAt,
  issuedByIdirGuid: issued.issuedByIdirGuid,
  activated: issued.activated,
  manageable: issued.manageable,
  createdAt: issued.createdAt,
})

export const apiKeysSlice = createSlice({
  name: 'apiKeys',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchApiKeys.pending, (state) => {
        // Drop the previous tenant's key immediately, so the section can never render
        // one tenant's key under another tenant's heading.
        state.keys = []
        state.loading = true
        state.error = undefined
      })
      .addCase(fetchApiKeys.fulfilled, (state, action) => {
        state.keys = action.payload
        state.loading = false
      })
      .addCase(fetchApiKeys.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload ?? 'Failed to load API keys'
      })

      .addCase(issueApiKey.pending, (state) => {
        state.saving = true
        state.error = undefined
      })
      .addCase(issueApiKey.fulfilled, (state, action) => {
        // The value itself is deliberately not kept in the store — the component holds
        // it only for as long as the dialog showing it is open.
        state.keys = [toStoredKey(action.payload), ...state.keys]
        state.saving = false
      })
      .addCase(issueApiKey.rejected, (state, action) => {
        state.saving = false
        state.error = action.payload ?? 'Failed to generate an API key'
      })

      .addCase(regenerateApiKey.pending, (state) => {
        state.saving = true
        state.error = undefined
      })
      .addCase(regenerateApiKey.fulfilled, (state, action) => {
        state.keys = replaceKey(state.keys, toStoredKey(action.payload))
        state.saving = false
      })
      .addCase(regenerateApiKey.rejected, (state, action) => {
        state.saving = false
        state.error = action.payload ?? 'Failed to regenerate the API key'
      })

      .addCase(updateApiKeyNotes.pending, (state) => {
        state.saving = true
        state.error = undefined
      })
      .addCase(updateApiKeyNotes.fulfilled, (state, action) => {
        state.keys = replaceKey(state.keys, action.payload)
        state.saving = false
      })
      .addCase(updateApiKeyNotes.rejected, (state, action) => {
        state.saving = false
        state.error = action.payload ?? 'Failed to save the notes'
      })
  },
})

export default apiKeysSlice.reducer
