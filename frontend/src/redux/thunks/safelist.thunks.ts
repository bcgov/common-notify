import { createAsyncThunk } from '@reduxjs/toolkit'
import { deleteMethod, get, post } from '@/common/api'
import type {
  CreateSafelistEntry,
  SafelistEntry,
  SafelistResponse,
} from '@/interfaces/safelist.interface'
import { getApiErrorMessage } from '@/utils/apiErrorMessage'
import type { RootState } from '../store'

const SAFELIST_URL = '/api/v1/frontend/safelist'

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
    return rejectWithValue(getApiErrorMessage(error, 'Failed to load the safelist'))
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
    return rejectWithValue(getApiErrorMessage(error, 'Failed to add the recipient'))
  }
})

export const removeSafelistEntry = createAsyncThunk<string, string, { rejectValue: string }>(
  'safelist/remove',
  async (id, { rejectWithValue }) => {
    try {
      await deleteMethod<void>({ url: `${SAFELIST_URL}/${id}` })
      return id
    } catch (error) {
      return rejectWithValue(getApiErrorMessage(error, 'Failed to remove the recipient'))
    }
  },
)
