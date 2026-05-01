import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { initializeAuthFromToken, fetchTenants } from '../thunks/auth.thunks'
import type { AuthUser } from '@/interfaces/AuthUser'
import type { Tenant } from '@/interfaces/Tenant'

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isInitializing: boolean
  error: string | null
  tenants: Tenant[]
  selectedTenant: Tenant | null
  showTenantModal: boolean
  tenantLoading: boolean
  tenantError: string | null
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isInitializing: true,
  error: null,
  tenants: [],
  selectedTenant: null,
  showTenantModal: false,
  tenantLoading: false,
  tenantError: null,
}

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<AuthUser>) => {
      state.user = action.payload
      state.isAuthenticated = true
      state.error = null
    },
    clearUser: (state) => {
      state.user = null
      state.isAuthenticated = false
      state.tenants = []
      state.selectedTenant = null
      state.showTenantModal = false
      state.tenantLoading = false
      state.tenantError = null
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
    selectTenant: (state, action: PayloadAction<Tenant>) => {
      state.selectedTenant = action.payload
      state.tenantError = null
      state.showTenantModal = false
    },
    setTenantError: (state, action: PayloadAction<string | null>) => {
      state.tenantError = action.payload
    },
    openTenantModal: (state) => {
      state.showTenantModal = true
    },
    closeTenantModal: (state) => {
      state.showTenantModal = false
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeAuthFromToken.pending, (state) => {
        state.isInitializing = true
      })
      .addCase(initializeAuthFromToken.fulfilled, (state, action) => {
        state.user = action.payload
        state.isAuthenticated = !!action.payload
        state.isInitializing = false
        state.error = null
      })
      .addCase(initializeAuthFromToken.rejected, (state, action) => {
        state.isInitializing = false
        state.error = action.payload || 'Failed to initialize auth'
        state.user = null
        state.isAuthenticated = false
      })
      .addCase(fetchTenants.pending, (state) => {
        state.tenantLoading = true
        state.tenantError = null
      })
      .addCase(fetchTenants.fulfilled, (state, action) => {
        state.tenants = action.payload
        state.tenantLoading = false
        state.tenantError = null

        // V3 Hybrid Model: Tenant selection logic
        if (action.payload.length === 0) {
          // Case C: No tenants → Use default tenant (temporary bootstrap)
          const defaultTenant: Tenant = {
            id: 'default',
            name: 'Default Tenant',
            slug: 'default',
            status: 'active',
            externalId: undefined,
            createdAt: new Date(),
            createdBy: undefined,
            updatedAt: new Date(),
            updatedBy: undefined,
            isDeleted: false,
          }
          state.selectedTenant = defaultTenant
          state.showTenantModal = false
        } else if (action.payload.length === 1) {
          // Case A: Single tenant → Auto-select, no modal
          state.selectedTenant = action.payload[0]
          state.showTenantModal = false
        } else {
          // Case B: Multiple tenants → Show modal for selection
          state.showTenantModal = true
          state.selectedTenant = null
        }
      })
      .addCase(fetchTenants.rejected, (state, action) => {
        state.tenantLoading = false
        state.tenantError = action.payload || 'Failed to fetch tenants'
        state.tenants = []
      })
  },
})

export const { setUser, clearUser, setError, selectTenant, setTenantError, openTenantModal, closeTenantModal } = authSlice.actions
export default authSlice.reducer
