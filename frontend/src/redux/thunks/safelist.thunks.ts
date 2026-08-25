import { createAsyncThunk } from '@reduxjs/toolkit'
import { deleteMethod, get, post } from '@/common/api'
import type {
  CreateSafelistEntry,
  SafelistEntry,
  SafelistResponse,
} from '@/interfaces/safelist.interface'
import type { RootState } from '../store'

const SAFELIST_URL = '/api/v1/frontend/safelist'

/** Message an axios error carries from the API, falling back to the supplied default. */
const apiErrorMessage = (error: unknown, fallback: string): string => {
  const response = (error as { response?: { data?: { message?: string | string[] } } })?.response
  const message = response?.data?.message
  if (Array.isArray(message)) return message.join(' ')
  if (typeof message === 'string' && message.length > 0) return message
  return error instanceof Error ? error.message : fallback
}

export const fetchSafelist = createAsyncThunk<
  SafelistResponse | null,
  void,
  { state: RootState; rejectValue: string }
>('safelist/fetch', async (_, { getState, rejectWithValue }) => {
  try {
    const tenantId = getState().tenant.selectedTenant?.id
    if (!tenantId) return null

    return await get<SafelistResponse>({ url: SAFELIST_URL })
  } catch (error) {
    return rejectWithValue(apiErrorMessage(error, 'Failed to load the safelist'))
  }
})

export const addSafelistEntry = createAsyncThunk<
  SafelistEntry,
  CreateSafelistEntry,
  { rejectValue: string }
>('safelist/add', async (payload, { rejectWithValue }) => {
  try {
    return await post<SafelistEntry, CreateSafelistEntry>({
      url: SAFELIST_URL,
      data: payload,
    })
  } catch (error) {
    return rejectWithValue(apiErrorMessage(error, 'Failed to add the recipient'))
  }
})

export const removeSafelistEntry = createAsyncThunk<string, string, { rejectValue: string }>(
  'safelist/remove',
  async (id, { rejectWithValue }) => {
    try {
      await deleteMethod<void>({ url: `${SAFELIST_URL}/${id}` })
      return id
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, 'Failed to remove the recipient'))
    }
  },
)
