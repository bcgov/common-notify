import { createSlice } from '@reduxjs/toolkit'
import { fetchTenantSettings, updateTenantSettings } from '../thunks/tenantSettings.thunks'

interface TenantSettingsState {
  alertEmail: string | null
  loading: boolean
  saving: boolean
  error?: string
}

const initialState: TenantSettingsState = {
  alertEmail: null,
  loading: false,
  saving: false,
}

export const tenantSettingsSlice = createSlice({
  name: 'tenantSettings',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTenantSettings.pending, (state) => {
        state.loading = true
        state.error = undefined
      })
      .addCase(fetchTenantSettings.fulfilled, (state, action) => {
        state.alertEmail = action.payload?.alertEmail ?? null
        state.loading = false
      })
      .addCase(fetchTenantSettings.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload ?? 'Failed to load tenant settings'
      })
      .addCase(updateTenantSettings.pending, (state) => {
        state.saving = true
        state.error = undefined
      })
      .addCase(updateTenantSettings.fulfilled, (state, action) => {
        state.alertEmail = action.payload.alertEmail
        state.saving = false
      })
      .addCase(updateTenantSettings.rejected, (state, action) => {
        state.saving = false
        state.error = action.payload ?? 'Failed to update tenant settings'
      })
  },
})

export default tenantSettingsSlice.reducer
