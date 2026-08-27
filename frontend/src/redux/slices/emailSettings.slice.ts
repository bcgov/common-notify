import { createSlice } from '@reduxjs/toolkit'
import { fetchSettings, updateEmailSettings } from '../thunks/settings.thunks'
import type { EmailSettingsValues } from '@/interfaces/tenant-settings.interface'

/** Matches the tenant_settings column defaults, used until a row exists for the tenant. */
export const defaultEmailSettings: EmailSettingsValues = {
  emailLogoId: null,
  emailNotificationsEnabled: true,
  replyToEmail: null,
  emailAttachmentsEnabled: true,
}

interface EmailSettingsState extends EmailSettingsValues {
  /** True while an email-tab PATCH is in flight. Loading is owned by Settings.tsx. */
  saving: boolean
  /** Save error only; load errors are surfaced by Settings.tsx. */
  error?: string
}

const initialState: EmailSettingsState = {
  ...defaultEmailSettings,
  saving: false,
}

export const emailSettingsSlice = createSlice({
  name: 'emailSettings',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // A new load starts: drop the previous tenant's values and any stale save error, so
      // the section can only ever mount against data for the tenant now on screen.
      .addCase(fetchSettings.pending, (state) => {
        state.emailLogoId = defaultEmailSettings.emailLogoId
        state.emailNotificationsEnabled = defaultEmailSettings.emailNotificationsEnabled
        state.replyToEmail = defaultEmailSettings.replyToEmail
        state.emailAttachmentsEnabled = defaultEmailSettings.emailAttachmentsEnabled
        state.error = undefined
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.emailLogoId = action.payload?.emailLogoId ?? defaultEmailSettings.emailLogoId
        state.emailNotificationsEnabled =
          action.payload?.emailNotificationsEnabled ??
          defaultEmailSettings.emailNotificationsEnabled
        state.replyToEmail = action.payload?.replyToEmail ?? defaultEmailSettings.replyToEmail
        state.emailAttachmentsEnabled =
          action.payload?.emailAttachmentsEnabled ?? defaultEmailSettings.emailAttachmentsEnabled
      })
      .addCase(updateEmailSettings.pending, (state) => {
        state.saving = true
        state.error = undefined
      })
      .addCase(updateEmailSettings.fulfilled, (state, action) => {
        state.emailLogoId = action.payload.emailLogoId
        state.emailNotificationsEnabled = action.payload.emailNotificationsEnabled
        state.replyToEmail = action.payload.replyToEmail
        state.emailAttachmentsEnabled = action.payload.emailAttachmentsEnabled
        state.saving = false
      })
      .addCase(updateEmailSettings.rejected, (state, action) => {
        state.saving = false
        state.error = action.payload ?? 'Failed to update email settings'
      })
  },
})

export default emailSettingsSlice.reducer
