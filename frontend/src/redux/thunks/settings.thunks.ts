import { createAsyncThunk } from '@reduxjs/toolkit'
import {
  getApprovedEmailLogos,
  getSettings,
  updateEmailSettings as updateEmailSettingsApi,
  updateSmsSettings as updateSmsSettingsApi,
  updateTenantSettings as updateTenantSettingsApi,
} from '@/api/settings.api'
import type {
  ApprovedEmailLogo,
  EmailSettingsValues,
  SmsSettingsValues,
  TenantSettings,
  TenantSettingsValues,
} from '@/interfaces/tenant-settings.interface'
import type { RootState } from '../store'

/**
 * Loads the whole tenant_settings row. Dispatched ONLY by Settings.tsx, which owns the
 * page-level loading gate; every settings slice seeds its values from this one action.
 * Resolves to null when no tenant is selected or no settings row exists yet.
 */
export const fetchSettings = createAsyncThunk<
  TenantSettings | null,
  void,
  { state: RootState; rejectValue: string }
>('settings/fetch', async (_, { getState, rejectWithValue }) => {
  try {
    const tenantId = getState().tenant.selectedTenant?.id
    if (!tenantId) return null

    return await getSettings()
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load settings')
  }
})

export const fetchApprovedEmailLogos = createAsyncThunk<
  ApprovedEmailLogo[],
  void,
  { rejectValue: string }
>('emailSettings/fetchApprovedLogos', async (_, { rejectWithValue }) => {
  try {
    return await getApprovedEmailLogos()
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : 'Failed to load approved email logos',
    )
  }
})

export const updateTenantSettings = createAsyncThunk<
  TenantSettings,
  TenantSettingsValues,
  { rejectValue: string }
>('tenantSettings/update', async (payload, { rejectWithValue }) => {
  try {
    return await updateTenantSettingsApi(payload)
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : 'Failed to update tenant settings',
    )
  }
})

export const updateEmailSettings = createAsyncThunk<
  TenantSettings,
  EmailSettingsValues,
  { rejectValue: string }
>('emailSettings/update', async (payload, { rejectWithValue }) => {
  try {
    return await updateEmailSettingsApi(payload)
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : 'Failed to update email settings',
    )
  }
})

export const updateSmsSettings = createAsyncThunk<
  TenantSettings,
  SmsSettingsValues,
  { rejectValue: string }
>('smsSettings/update', async (payload, { rejectWithValue }) => {
  try {
    return await updateSmsSettingsApi(payload)
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to update SMS settings')
  }
})
