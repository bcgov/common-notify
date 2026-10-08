import { createAsyncThunk } from '@reduxjs/toolkit'
import { fetchApiKeyUsage } from './apiKeyUsage.thunks'
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
 * Loads the tenant settings and usage limit. Dispatched ONLY by Settings.tsx, which owns the
 * page-level loading gate; every settings slice seeds its values from this one action.
 * Reuses cached usage for this tenant. Resolves to null when no tenant is selected.
 */
export const fetchSettings = createAsyncThunk<
  (Partial<TenantSettings> & { rateLimitPerMinute: number | null }) | null,
  void,
  { state: RootState; rejectValue: string }
>('settings/fetch', async (_, { getState, dispatch, rejectWithValue }) => {
  try {
    const tenantId = getState().tenant.selectedTenant?.id
    if (!tenantId) return null

    const cachedUsage = getState().apiKeyUsage.usage
    const [settings, usage] = await Promise.all([
      getSettings(),
      cachedUsage?.tenantId === tenantId
        ? Promise.resolve(cachedUsage)
        : dispatch(fetchApiKeyUsage()).unwrap(),
    ])

    // The API has per-channel limits; summarize with the lowest configured limit.
    // No configured limits means an empty channels array. Zero is a numeric limit.
    const rateLimitPerMinute = usage.channels.length
      ? Math.min(...usage.channels.map((channel) => channel.rateLimitPerMinute))
      : null
    return { ...settings, rateLimitPerMinute }
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
