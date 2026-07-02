import { createSlice } from '@reduxjs/toolkit'
import type {
  TenantUsageResponse,
  UsageHistoryEntry,
  AdminTenantUsageRow,
} from '@/api/apiKeyUsage.api'
import {
  fetchApiKeyUsage,
  fetchApiKeyUsageHistory,
  fetchAllTenantsUsage,
  updateThreshold,
} from '../thunks/apiKeyUsage.thunks'

interface ApiKeyUsageState {
  usage: TenantUsageResponse | null
  history: UsageHistoryEntry[]
  isLoading: boolean
  hasLoaded: boolean
  error: string | null
  historyLoading: boolean
  historyError: string | null
  updatingChannel: string | null
  updateError: string | null
  // Admin (all tenants) view
  adminRows: AdminTenantUsageRow[]
  adminLoading: boolean
  adminError: string | null
}

const initialState: ApiKeyUsageState = {
  usage: null,
  history: [],
  isLoading: false,
  hasLoaded: false,
  error: null,
  historyLoading: false,
  historyError: null,
  updatingChannel: null,
  updateError: null,
  adminRows: [],
  adminLoading: false,
  adminError: null,
}

export const apiKeyUsageSlice = createSlice({
  name: 'apiKeyUsage',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Fetch usage
      .addCase(fetchApiKeyUsage.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchApiKeyUsage.fulfilled, (state, action) => {
        state.usage = action.payload
        state.isLoading = false
        state.hasLoaded = true
      })
      .addCase(fetchApiKeyUsage.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload ?? 'Failed to load usage'
      })
      // Fetch history
      .addCase(fetchApiKeyUsageHistory.pending, (state) => {
        state.historyLoading = true
        state.historyError = null
      })
      .addCase(fetchApiKeyUsageHistory.fulfilled, (state, action) => {
        state.history = action.payload
        state.historyLoading = false
      })
      .addCase(fetchApiKeyUsageHistory.rejected, (state, action) => {
        state.historyLoading = false
        state.historyError = action.payload ?? 'Failed to load usage history'
      })
      // Fetch all tenants usage (admin)
      .addCase(fetchAllTenantsUsage.pending, (state) => {
        state.adminLoading = true
        state.adminError = null
      })
      .addCase(fetchAllTenantsUsage.fulfilled, (state, action) => {
        state.adminRows = action.payload
        state.adminLoading = false
      })
      .addCase(fetchAllTenantsUsage.rejected, (state, action) => {
        state.adminLoading = false
        state.adminError = action.payload ?? 'Failed to load tenant usage'
      })
      // Update threshold
      .addCase(updateThreshold.pending, (state, action) => {
        state.updatingChannel = action.meta.arg.channel
        state.updateError = null
      })
      .addCase(updateThreshold.fulfilled, (state, action) => {
        state.usage = action.payload
        state.updatingChannel = null
      })
      .addCase(updateThreshold.rejected, (state, action) => {
        state.updatingChannel = null
        state.updateError = action.payload ?? 'Failed to update threshold'
      })
  },
})

export default apiKeyUsageSlice.reducer
