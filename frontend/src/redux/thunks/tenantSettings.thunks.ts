import { createAsyncThunk } from '@reduxjs/toolkit'
import { get, patch } from '@/common/api'
import type { TenantSettings } from '@/interfaces/tenant-settings.interface'
import type { RootState } from '../store'

export const fetchTenantSettings = createAsyncThunk<
  TenantSettings | null,
  void,
  { state: RootState; rejectValue: string }
>('tenantSettings/fetch', async (_, { getState, rejectWithValue }) => {
  try {
    const tenantId = getState().tenant.selectedTenant?.id
    if (!tenantId) return null

    return await get<TenantSettings | null>({
      url: '/api/v1/frontend/tenant-settings/tenant',
    })
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : 'Failed to load tenant settings',
    )
  }
})

export const updateTenantSettings = createAsyncThunk<
  TenantSettings,
  { alertEmail: string | null; defaultSenderEmail: string | null },
  { rejectValue: string }
>('tenantSettings/update', async (payload, { rejectWithValue }) => {
  try {
    return await patch<
      TenantSettings,
      { alertEmail: string | null; defaultSenderEmail: string | null }
    >({
      url: '/api/v1/frontend/tenant-settings/tenant',
      params: payload,
    })
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : 'Failed to update tenant settings',
    )
  }
})
