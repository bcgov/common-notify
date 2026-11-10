import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { AdminNotificationRow } from '@/api/adminNotifications.api'
import { fetchAdminNotifications } from '../thunks/adminNotifications.thunks'
import { isStaleResponse } from '../utils/latestRequest'

/** How far back the list looks until an admin picks dates: a week, today included. */
export const DEFAULT_RANGE_DAYS = 7

/** A local date as YYYY-MM-DD, `daysAgo` days before today. */
export function localDay(daysAgo = 0): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * The admin Notifications list's query and rows. Kept in the store, not the page, so the
 * filters survive opening a request and coming back. Not tenant-scoped: it spans every tenant.
 */
interface AdminNotificationsState {
  items: AdminNotificationRow[]
  page: number
  limit: number
  count: number
  /** Tenant name search. */
  search: string
  /** Column filters, e.g. { status: ['failed'], channel: ['SMS'] }. */
  filters: Record<string, string[]>
  /** Inclusive date range, YYYY-MM-DD in local time; null leaves that end open. */
  from: string | null
  to: string | null
  isLoading: boolean
  hasLoaded: boolean
  error: string | null
  requestId: string | null
}

const initialState = (): AdminNotificationsState => ({
  items: [],
  page: 1,
  limit: 15,
  count: 0,
  search: '',
  filters: {},
  from: localDay(DEFAULT_RANGE_DAYS - 1),
  to: localDay(),
  isLoading: false,
  hasLoaded: false,
  error: null,
  requestId: null,
})

export const adminNotificationsSlice = createSlice({
  name: 'adminNotifications',
  initialState,
  reducers: {
    setPage(state, action: PayloadAction<number>) {
      state.page = Math.max(1, action.payload)
    },
    setLimit(state, action: PayloadAction<number>) {
      state.limit = action.payload
      state.page = 1
    },
    setSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
    },
    setFilter(state, action: PayloadAction<{ field: string; values: string[] }>) {
      const { field, values } = action.payload
      if (values.length === 0) delete state.filters[field]
      else state.filters[field] = values
      state.page = 1
    },
    setDateRange(state, action: PayloadAction<{ from: string | null; to: string | null }>) {
      state.from = action.payload.from
      state.to = action.payload.to
      state.page = 1
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAdminNotifications.pending, (state, action) => {
        state.isLoading = true
        state.error = null
        state.requestId = action.meta.requestId
      })
      .addCase(fetchAdminNotifications.fulfilled, (state, action) => {
        if (isStaleResponse(state.requestId, action)) return
        state.items = action.payload.data
        state.count = action.payload.count
        state.page = action.payload.page
        state.isLoading = false
        state.hasLoaded = true
        state.requestId = null
      })
      .addCase(fetchAdminNotifications.rejected, (state, action) => {
        if (isStaleResponse(state.requestId, action)) return
        state.isLoading = false
        state.error = action.payload ?? 'Failed to load notifications'
        state.requestId = null
      })
  },
})

export const { setPage, setLimit, setSearch, setFilter, setDateRange } =
  adminNotificationsSlice.actions

export default adminNotificationsSlice.reducer
