import { createSlice } from '@reduxjs/toolkit'
import { fetchSettings, updateSmsSettings } from '../thunks/settings.thunks'
import type { SmsSettingsValues } from '@/interfaces/tenant-settings.interface'

/** Matches the tenant_settings column defaults, used until a row exists for the tenant. */
export const defaultSmsSettings: SmsSettingsValues = {
  smsNotificationsEnabled: true,
  includeTenantNameInSms: true,
  internationalSmsEnabled: false,
}

interface SmsSettingsState extends SmsSettingsValues {
  /** True while an SMS-tab PATCH is in flight. Loading is owned by Settings.tsx. */
  saving: boolean
  /** Save error only; load errors are surfaced by Settings.tsx. */
  error?: string
}

const initialState: SmsSettingsState = {
  ...defaultSmsSettings,
  saving: false,
}

export const smsSettingsSlice = createSlice({
  name: 'smsSettings',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // A new load starts: drop the previous tenant's values and any stale save error, so
      // the section can only ever mount against data for the tenant now on screen.
      .addCase(fetchSettings.pending, (state) => {
        state.smsNotificationsEnabled = defaultSmsSettings.smsNotificationsEnabled
        state.includeTenantNameInSms = defaultSmsSettings.includeTenantNameInSms
        state.internationalSmsEnabled = defaultSmsSettings.internationalSmsEnabled
        state.error = undefined
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.smsNotificationsEnabled =
          action.payload?.smsNotificationsEnabled ?? defaultSmsSettings.smsNotificationsEnabled
        state.includeTenantNameInSms =
          action.payload?.includeTenantNameInSms ?? defaultSmsSettings.includeTenantNameInSms
        state.internationalSmsEnabled =
          action.payload?.internationalSmsEnabled ?? defaultSmsSettings.internationalSmsEnabled
      })
      .addCase(updateSmsSettings.pending, (state) => {
        state.saving = true
        state.error = undefined
      })
      .addCase(updateSmsSettings.fulfilled, (state, action) => {
        state.smsNotificationsEnabled = action.payload.smsNotificationsEnabled
        state.includeTenantNameInSms = action.payload.includeTenantNameInSms
        state.internationalSmsEnabled = action.payload.internationalSmsEnabled
        state.saving = false
      })
      .addCase(updateSmsSettings.rejected, (state, action) => {
        state.saving = false
        state.error = action.payload ?? 'Failed to update SMS settings'
      })
  },
})

export default smsSettingsSlice.reducer
