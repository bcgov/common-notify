import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { ApiKeyResponse } from '@/api/apiKeyService'

interface ApiKeysState {
  // Store keys by tenant ID for easy lookup
  keysByTenant: {
    [tenantId: string]: ApiKeyResponse[]
  }
  loadingByTenant: {
    [tenantId: string]: boolean
  }
  errorByTenant: {
    [tenantId: string]: string | null
  }
}

const initialState: ApiKeysState = {
  keysByTenant: {},
  loadingByTenant: {},
  errorByTenant: {},
}

export const apiKeysSlice = createSlice({
  name: 'apiKeys',
  initialState,
  reducers: {
    // Set the full list of keys for a tenant
    setKeys(state, action: PayloadAction<{ tenantId: string; keys: ApiKeyResponse[] }>) {
      const { tenantId, keys } = action.payload
      state.keysByTenant[tenantId] = keys
      state.errorByTenant[tenantId] = null
    },

    // Add a new key to a tenant's list
    addKey(state, action: PayloadAction<{ tenantId: string; key: ApiKeyResponse }>) {
      const { tenantId, key } = action.payload
      if (!state.keysByTenant[tenantId]) {
        state.keysByTenant[tenantId] = []
      }
      state.keysByTenant[tenantId].unshift(key)
    },

    // Remove a key from a tenant's list
    removeKey(state, action: PayloadAction<{ tenantId: string; keyId: string }>) {
      const { tenantId, keyId } = action.payload
      if (state.keysByTenant[tenantId]) {
        state.keysByTenant[tenantId] = state.keysByTenant[tenantId].filter((k) => k.id !== keyId)
      }
    },

    // Set loading state for a tenant
    setLoading(state, action: PayloadAction<{ tenantId: string; isLoading: boolean }>) {
      const { tenantId, isLoading } = action.payload
      state.loadingByTenant[tenantId] = isLoading
    },

    // Set error state for a tenant
    setError(state, action: PayloadAction<{ tenantId: string; error: string | null }>) {
      const { tenantId, error } = action.payload
      state.errorByTenant[tenantId] = error
    },

    // Clear all data for a tenant
    clearTenantData(state, action: PayloadAction<string>) {
      const tenantId = action.payload
      delete state.keysByTenant[tenantId]
      delete state.loadingByTenant[tenantId]
      delete state.errorByTenant[tenantId]
    },
  },
})

export const { setKeys, addKey, removeKey, setLoading, setError, clearTenantData } =
  apiKeysSlice.actions

export default apiKeysSlice.reducer
