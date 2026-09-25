import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { fetchNotifications } from '../thunks/notification.thunks'
import { MAX_NOTIFICATION_RESULTS_PER_PAGE } from '@/config/notification'
import type { RootState } from '../store'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'
import { selectTenant } from './tenant.slice'
import { isStaleResponse } from '../utils/latestRequest'

interface NotificationState {
  items: NotificationRequest[]
  sortBy: string | null
  sortOrder: 'asc' | 'desc' | null
  filters: Record<string, string[]>
  page: number
  limit: number
  count: number
  totalPages: number
  isLoading: boolean
  hasLoaded: boolean
  error: string | null
  /** Request id of the fetch currently being awaited; see utils/latestRequest. */
  currentRequestId: string | null
}

const initialState: NotificationState = {
  items: [],
  sortBy: null,
  sortOrder: null,
  filters: {},
  page: 1,
  limit: MAX_NOTIFICATION_RESULTS_PER_PAGE,
  count: 0,
  totalPages: 0,
  isLoading: false,
  hasLoaded: false,
  error: null,
  currentRequestId: null,
}

export const notificationSlice = createSlice({
  name: 'notification',
  initialState,
  reducers: {
    setSort(
      state,
      action: PayloadAction<{ sortBy: string | null; sortOrder: 'asc' | 'desc' | null }>,
    ) {
      state.sortBy = action.payload.sortBy
      state.sortOrder = action.payload.sortOrder
      state.page = 1
    },
    setFilter(state, action: PayloadAction<{ field: string; values: string[] }>) {
      const { field, values } = action.payload
      if (values.length === 0) {
        delete state.filters[field]
      } else {
        state.filters[field] = values
      }
      state.page = 1
    },
    setPage(state, action: PayloadAction<number>) {
      state.page = Math.max(1, action.payload)
    },
    setLimit(state, action: PayloadAction<number>) {
      state.limit = action.payload
      state.page = 1
    },
    upsertNotification(state, action: PayloadAction<NotificationRequest>) {
      const idx = state.items.findIndex((item) => item.id === action.payload.id)
      if (idx !== -1) {
        state.items[idx] = action.payload
      } else {
        const statusFilters = state.filters.status
        if (
          !statusFilters ||
          statusFilters.length === 0 ||
          statusFilters.includes(action.payload.status.code)
        ) {
          state.items.unshift(action.payload)
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Notification requests are tenant-scoped, so a tenant switch invalidates the
      // rows, the paging and the filters that produced them. Resetting clears hasLoaded
      // too, which is what puts the table back into its loading state instead of showing
      // the previous tenant's requests until the refetch lands.
      // Every page holding this data refetches on tenant change, so the reset marks the
      // slice as loading rather than briefly rendering an empty table between the two.
      .addCase(selectTenant, () => ({ ...initialState, isLoading: true }))
      .addCase(fetchNotifications.pending, (state, action) => {
        state.isLoading = true
        state.error = null
        state.currentRequestId = action.meta.requestId
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        if (isStaleResponse(state.currentRequestId, action)) return
        state.isLoading = false
        state.hasLoaded = true
        state.currentRequestId = null
        state.items = action.payload.data
        state.count = action.payload.count
        state.page = action.payload.page
        state.limit = action.payload.limit
        state.totalPages = action.payload.totalPages
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        if (isStaleResponse(state.currentRequestId, action)) return
        state.isLoading = false
        state.currentRequestId = null
        state.error = (action.payload as string) ?? 'Failed to load notifications'
      })
  },
})

export const { setSort, setFilter, setPage, setLimit, upsertNotification } =
  notificationSlice.actions

export const selectNotifications = (state: RootState) => state.notification.items

export default notificationSlice.reducer
