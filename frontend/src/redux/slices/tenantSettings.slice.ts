import { fetchApiKeyUsage } from '../thunks/apiKeyUsage.thunks'
import { createSlice } from '@reduxjs/toolkit'
import { fetchSettings, updateTenantSettings } from '../thunks/settings.thunks'
import type { TenantSettingsValues } from '@/interfaces/tenant-settings.interface'

/** Used until a settings row exists for the tenant. */
export const defaultTenantSettings: TenantSettingsValues = {
  alertEmail: null,
  defaultSenderEmail: null,
}

interface TenantSettingsState extends TenantSettingsValues {
  rateLimitPerMinute: { EMAIL: number | null; SMS: number | null } | undefined
  /** True while a tenant-tab PATCH is in flight. Loading is owned by Settings.tsx. */
  saving: boolean
  /** Save error only; load errors are surfaced by Settings.tsx. */
  error?: string
}

const initialState: TenantSettingsState = {
  ...defaultTenantSettings,
  rateLimitPerMinute: undefined,
  saving: false,
}

export const tenantSettingsSlice = createSlice({
  name: 'tenantSettings',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // A new load starts: drop the previous tenant's values and any stale save error, so
      // the section can only ever mount against data for the tenant now on screen.
      .addCase(fetchSettings.pending, (state) => {
        state.rateLimitPerMinute = undefined
        state.alertEmail = defaultTenantSettings.alertEmail
        state.defaultSenderEmail = defaultTenantSettings.defaultSenderEmail
        state.error = undefined
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.rateLimitPerMinute = action.payload?.rateLimitPerMinute ?? { EMAIL: null, SMS: null }
        state.alertEmail = action.payload?.alertEmail ?? defaultTenantSettings.alertEmail
        state.defaultSenderEmail =
          action.payload?.defaultSenderEmail ?? defaultTenantSettings.defaultSenderEmail
      })
      .addCase(fetchApiKeyUsage.fulfilled, (state, action) => {
        state.rateLimitPerMinute = {
          EMAIL:
            action.payload.channels.find((channel) => channel.channel === 'EMAIL')
              ?.rateLimitPerMinute ?? null,
          SMS:
            action.payload.channels.find((channel) => channel.channel === 'SMS')
              ?.rateLimitPerMinute ?? null,
        }
      })
      .addCase(updateTenantSettings.pending, (state) => {
        state.saving = true
        state.error = undefined
      })
      .addCase(updateTenantSettings.fulfilled, (state, action) => {
        state.alertEmail = action.payload.alertEmail
        state.defaultSenderEmail = action.payload.defaultSenderEmail
        state.saving = false
      })
      .addCase(updateTenantSettings.rejected, (state, action) => {
        state.saving = false
        state.error = action.payload ?? 'Failed to update tenant settings'
      })
  },
})

export default tenantSettingsSlice.reducer
