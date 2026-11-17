import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { fetchAllNotifyTenants, fetchNotifyTenantOptions } from '../thunks/adminTenants.thunks'

interface AdminTenantsState {
  items: Array<{
    id: string
    name: string
  }>
  isLoading: boolean
  error: string | null
  /** Tenants with Notify connected, for the admin tenant searches; see fetchNotifyTenantOptions. */
  notifyOptions: Array<{ id: string; name: string }>
  /** Set once requested, so each screen that needs the options doesn't fetch them again. */
  notifyOptionsRequested: boolean
}

const initialState: AdminTenantsState = {
  items: [],
  isLoading: false,
  error: null,
  notifyOptions: [],
  notifyOptionsRequested: false,
}

export const adminTenantsSlice = createSlice({
  name: 'adminTenants',
  initialState,
  reducers: {
    // Allow manual clearing of tenants if needed (e.g., on logout)
    clearAdminTenants: (state) => {
      state.items = []
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAllNotifyTenants.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(
        fetchAllNotifyTenants.fulfilled,
        (
          state,
          action: PayloadAction<
            Array<{
              id: string
              name: string
            }>
          >,
        ) => {
          state.items = action.payload
          state.isLoading = false
          state.error = null
        },
      )
      .addCase(fetchNotifyTenantOptions.pending, (state) => {
        state.notifyOptionsRequested = true
      })
      .addCase(fetchNotifyTenantOptions.fulfilled, (state, action) => {
        state.notifyOptions = action.payload
      })
      // A failure leaves the options empty: the search still works on typed text. Cleared so the
      // next screen to mount tries again.
      .addCase(fetchNotifyTenantOptions.rejected, (state) => {
        state.notifyOptionsRequested = false
      })
      .addCase(fetchAllNotifyTenants.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload ?? 'Error'
        // Don't clear tenants on error - keep cached tenants
      })
  },
})

export const { clearAdminTenants } = adminTenantsSlice.actions
export default adminTenantsSlice.reducer
