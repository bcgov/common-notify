import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { Tenant } from '@/interfaces/CstarTenant'
import { clearUser } from './auth.slice'
import { fetchCstarTenants } from '../thunks/cstar.thunks'

interface TenantState {
  selectedTenant: Tenant | null
  showTenantModal: boolean
}

const initialState: TenantState = {
  selectedTenant: null,
  showTenantModal: false,
}

export const tenantSlice = createSlice({
  name: 'tenant',
  initialState,
  reducers: {
    selectTenant: (state, action: PayloadAction<Tenant>) => {
      state.selectedTenant = action.payload
      state.showTenantModal = false
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCstarTenants.pending, (state) => {
        state.showTenantModal = false
      })
      .addCase(fetchCstarTenants.fulfilled, (state, action) => {
        const tenants = action.payload

        if (tenants.length === 0) {
          state.selectedTenant = null
          state.showTenantModal = false
          return
        }

        if (tenants.length === 1) {
          state.selectedTenant = tenants[0]
          state.showTenantModal = false
          return
        }

        const selectedTenantId = state.selectedTenant?.id
        const matchingTenant = selectedTenantId
          ? tenants.find((tenant) => tenant.id === selectedTenantId) || null
          : null

        state.selectedTenant = matchingTenant
        state.showTenantModal = matchingTenant === null
      })
      .addCase(fetchCstarTenants.rejected, (state) => {
        state.selectedTenant = null
        state.showTenantModal = false
      })
      .addCase(clearUser, () => initialState)
  },
})

export const { selectTenant } = tenantSlice.actions
export default tenantSlice.reducer
