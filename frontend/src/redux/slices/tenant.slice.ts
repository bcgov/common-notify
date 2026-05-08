import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { Tenant } from '@/interfaces/CstarTenant'
import { clearUser } from './auth.slice'
import { fetchCstarTenants } from '../thunks/cstar.thunks'

interface TenantState {
  selectedTenant: Tenant | null
  showTenantModal: boolean
}

const SELECTED_TENANT_STORAGE_KEY = 'notify_selected_tenant'

// Load selected tenant from localStorage if available
const loadSelectedTenantFromStorage = (): Tenant | null => {
  try {
    const stored = localStorage.getItem(SELECTED_TENANT_STORAGE_KEY)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

const initialState: TenantState = {
  selectedTenant: loadSelectedTenantFromStorage(),
  showTenantModal: false,
}

export const tenantSlice = createSlice({
  name: 'tenant',
  initialState,
  reducers: {
    selectTenant: (state, action: PayloadAction<Tenant>) => {
      state.selectedTenant = action.payload
      state.showTenantModal = false
      // Persist to localStorage
      localStorage.setItem(SELECTED_TENANT_STORAGE_KEY, JSON.stringify(action.payload))
    },
  },
  extraReducers: (builder) => {
    builder
      // Don't modify showTenantModal on pending - wait for the result
      // This prevents the modal from flashing open/closed
      .addCase(fetchCstarTenants.fulfilled, (state, action) => {
        const tenants = action.payload

        if (tenants.length === 0) {
          state.selectedTenant = null
          state.showTenantModal = false
          localStorage.removeItem(SELECTED_TENANT_STORAGE_KEY)
          return
        }

        if (tenants.length === 1) {
          state.selectedTenant = tenants[0]
          state.showTenantModal = false
          localStorage.setItem(SELECTED_TENANT_STORAGE_KEY, JSON.stringify(tenants[0]))
          return
        }

        const selectedTenantId = state.selectedTenant?.id
        const matchingTenant = selectedTenantId
          ? tenants.find((tenant) => tenant.id === selectedTenantId) || null
          : null

        state.selectedTenant = matchingTenant
        state.showTenantModal = matchingTenant === null
        // Update localStorage if tenant is still valid
        if (matchingTenant) {
          localStorage.setItem(SELECTED_TENANT_STORAGE_KEY, JSON.stringify(matchingTenant))
        } else {
          localStorage.removeItem(SELECTED_TENANT_STORAGE_KEY)
        }
      })
      .addCase(fetchCstarTenants.rejected, (state) => {
        // Only clear tenant if we don't have one already
        // If user has a selected tenant, keep it even if CSTAR fetch fails
        // The CSTAR error is only critical if we need to select a tenant
        if (!state.selectedTenant) {
          state.showTenantModal = false
        }
      })
      .addCase(clearUser, (state) => {
        // Clear localStorage when user logs out
        localStorage.removeItem(SELECTED_TENANT_STORAGE_KEY)
        return initialState
      })
  },
})

export const { selectTenant } = tenantSlice.actions
export default tenantSlice.reducer
