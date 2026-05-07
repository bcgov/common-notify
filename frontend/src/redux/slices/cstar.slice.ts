import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { Tenant } from '@/interfaces/CstarTenant'
import { clearUser } from './auth.slice'
import { fetchCstarTenants } from '../thunks/cstar.thunks'

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
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCstarTenants.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchCstarTenants.fulfilled, (state, action: PayloadAction<Tenant[]>) => {
        state.tenants = action.payload
        state.isLoading = false
        state.error = null
      })
      .addCase(fetchCstarTenants.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload ?? 'Error'
      })
      .addCase(clearUser, () => initialState)
  },
})

export default cstarSlice.reducer
