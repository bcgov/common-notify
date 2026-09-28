import { createAsyncThunk } from '@reduxjs/toolkit'
import {
  getApiKeys,
  issueApiKey as issueApiKeyApi,
  regenerateApiKey as regenerateApiKeyApi,
  updateApiKeyNotes as updateApiKeyNotesApi,
} from '@/api/apiKeys.api'
import type { ApiKey, IssuedApiKey } from '@/interfaces/api-key.interface'
import type { RootState } from '../store'

/** Loads the tenant's API keys. Resolves to an empty list when no tenant is selected. */
export const fetchApiKeys = createAsyncThunk<
  ApiKey[],
  void,
  { state: RootState; rejectValue: string }
>('apiKeys/fetch', async (_, { getState, rejectWithValue }) => {
  try {
    const tenantId = getState().tenant.selectedTenant?.id
    if (!tenantId) return []

    return await getApiKeys()
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load API keys')
  }
})

export const issueApiKey = createAsyncThunk<
  IssuedApiKey,
  string | undefined,
  { rejectValue: string }
>('apiKeys/issue', async (notes, { rejectWithValue }) => {
  try {
    return await issueApiKeyApi(notes)
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to generate an API key')
  }
})

export const regenerateApiKey = createAsyncThunk<IssuedApiKey, string, { rejectValue: string }>(
  'apiKeys/regenerate',
  async (clientId, { rejectWithValue }) => {
    try {
      return await regenerateApiKeyApi(clientId)
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Failed to regenerate the API key',
      )
    }
  },
)

export const updateApiKeyNotes = createAsyncThunk<
  ApiKey,
  { clientId: string; notes: string | null },
  { rejectValue: string }
>('apiKeys/updateNotes', async ({ clientId, notes }, { rejectWithValue }) => {
  try {
    return await updateApiKeyNotesApi(clientId, notes)
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to save the notes')
  }
})
