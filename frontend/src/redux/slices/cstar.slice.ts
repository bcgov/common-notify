import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { Tenant } from '@/interfaces/CstarTenant'
import { clearUser } from './auth.slice'
import { fetchCstarTenants } from '../thunks/cstar.thunks'
import { selectTenant } from './tenant.slice'

interface CstarState {
  tenants: Tenant[]
  isLoading: boolean
  error: string | null
}

const initialState: CstarState = {
  tenants: [],
  isLoading: false,
  error: null,
}

export const cstarSlice = createSlice({
  name: 'cstar',
  initialState,
  reducers: {
    // Allow manual clearing of tenants if needed (e.g., on logout)
    clearTenants: (state) => {
      state.tenants = []
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCstarTenants.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchCstarTenants.fulfilled, (state, action: PayloadAction<Tenant[]>) => {
        // Always update with the latest tenants from CSTAR
        state.tenants = action.payload
        state.isLoading = false
        state.error = null
      })
      .addCase(fetchCstarTenants.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload ?? 'Error'
        // Don't clear tenants on error - keep cached tenants
      })
      .addCase(selectTenant, (state) => {
        // Clear CSTAR error once tenant is selected
        // We don't need CSTAR API anymore after this point
        state.error = null
      })
      .addCase(clearUser, () => initialState)
  },
})

export default cstarSlice.reducer
