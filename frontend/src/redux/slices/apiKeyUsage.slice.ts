import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type {
  TenantUsageResponse,
  UsageHistoryEntry,
  AdminTenantUsageRow,
} from '@/api/apiKeyUsage.api'
import {
  fetchApiKeyUsage,
  fetchApiKeyUsageHistory,
  fetchAllTenantsUsage,
  updateTenantLimits,
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
  // Admin (all tenants) view — server-side paginated + searched (by tenant)
  adminRows: AdminTenantUsageRow[]
  adminLoading: boolean
  adminError: string | null
  adminPage: number
  adminLimit: number
  adminSearch: string
  adminCount: number
  adminTotalPages: number
  // Key (`${tenantId}-${channel}`) currently being saved via the admin limit editor
  adminUpdatingKey: string | null
  adminUpdateError: string | null
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
  adminPage: 1,
  adminLimit: 15,
  adminSearch: '',
  adminCount: 0,
  adminTotalPages: 0,
  adminUpdatingKey: null,
  adminUpdateError: null,
}

export const apiKeyUsageSlice = createSlice({
  name: 'apiKeyUsage',
  initialState,
  reducers: {
    setAdminPage(state, action: PayloadAction<number>) {
      state.adminPage = Math.max(1, action.payload)
    },
    setAdminLimit(state, action: PayloadAction<number>) {
      state.adminLimit = action.payload
      state.adminPage = 1
    },
    setAdminSearch(state, action: PayloadAction<string>) {
      state.adminSearch = action.payload
      state.adminPage = 1
    },
  },
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
      // Fetch all tenants usage (admin, paginated)
      .addCase(fetchAllTenantsUsage.pending, (state) => {
        state.adminLoading = true
        state.adminError = null
      })
      .addCase(fetchAllTenantsUsage.fulfilled, (state, action) => {
        state.adminRows = action.payload.data
        state.adminCount = action.payload.count
        state.adminPage = action.payload.page
        state.adminLimit = action.payload.limit
        state.adminTotalPages = action.payload.totalPages
        state.adminLoading = false
      })
      .addCase(fetchAllTenantsUsage.rejected, (state, action) => {
        state.adminLoading = false
        state.adminError = action.payload ?? 'Failed to load tenant usage'
      })
      // Update tenant limits (admin) — merge the returned rows in place
      .addCase(updateTenantLimits.pending, (state, action) => {
        state.adminUpdatingKey = `${action.meta.arg.tenantId}-${action.meta.arg.channel}`
        state.adminUpdateError = null
      })
      .addCase(updateTenantLimits.fulfilled, (state, action) => {
        const updated = new Map(
          action.payload.map((row) => [`${row.tenantId}-${row.channel}`, row]),
        )
        state.adminRows = state.adminRows.map(
          (row) => updated.get(`${row.tenantId}-${row.channel}`) ?? row,
        )
        state.adminUpdatingKey = null
      })
      .addCase(updateTenantLimits.rejected, (state, action) => {
        state.adminUpdatingKey = null
        state.adminUpdateError = action.payload ?? 'Failed to update limits'
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

export const { setAdminPage, setAdminLimit, setAdminSearch } = apiKeyUsageSlice.actions

export default apiKeyUsageSlice.reducer
