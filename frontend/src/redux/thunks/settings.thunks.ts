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
 * Loads tenant settings and usage limits for Settings.tsx and EditEvent.tsx.
 * Every settings slice seeds its values from this action; Settings.tsx owns its loading gate.
 * Reuses cached usage for this tenant. Resolves to null when no tenant is selected.
 */
export const fetchSettings = createAsyncThunk<
  | (Partial<TenantSettings> & { rateLimitPerMinute: { EMAIL: number | null; SMS: number | null } })
  | null,
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

    // Missing channel limits are unconfigured; preserve numeric zero.
    const rateLimitPerMinute = {
      EMAIL:
        usage.channels.find((channel) => channel.channel === 'EMAIL')?.rateLimitPerMinute ?? null,
      SMS: usage.channels.find((channel) => channel.channel === 'SMS')?.rateLimitPerMinute ?? null,
    }
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
