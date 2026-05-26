import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { fetchAllNotifyTenants } from '../thunks/adminTenants.thunks'

interface AdminTenantsState {
  items: Array<{
    id: string
    name: string
  }>
  isLoading: boolean
  error: string | null
}

const initialState: AdminTenantsState = {
  items: [],
  isLoading: false,
  error: null,
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
      .addCase(fetchAllNotifyTenants.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload ?? 'Error'
        // Don't clear tenants on error - keep cached tenants
      })
  },
})

export const { clearAdminTenants } = adminTenantsSlice.actions
export default adminTenantsSlice.reducer
