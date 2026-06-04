import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { fetchNotifications } from '../thunks/notification.thunks'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'
import type { NotificationStatus } from '@/enum/notification-status.enum'
import { MAX_NOTIFICATION_RESULTS_PER_PAGE } from '@/config/notification'
import type { RootState } from '../store'

interface NotificationState {
  items: NotificationRequest[]
  statusFilter: NotificationStatus | 'all'
  page: number
  limit: number
  count: number
  totalPages: number
  isLoading: boolean
  hasLoaded: boolean
  error: string | null
}

const initialState: NotificationState = {
  items: [],
  statusFilter: 'all',
  page: 1,
  limit: MAX_NOTIFICATION_RESULTS_PER_PAGE,
  count: 0,
  totalPages: 0,
  isLoading: false,
  hasLoaded: false,
  error: null,
}

export const notificationSlice = createSlice({
  name: 'notification',
  initialState,
  reducers: {
    setStatusFilter(state, action: PayloadAction<NotificationStatus | 'all'>) {
      state.statusFilter = action.payload
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
      } else if (state.statusFilter === 'all' || state.statusFilter === action.payload.status) {
        state.items.unshift(action.payload)
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.isLoading = false
        state.hasLoaded = true
        state.items = action.payload.data
        state.count = action.payload.count
        state.page = action.payload.page
        state.limit = action.payload.limit
        state.totalPages = action.payload.totalPages
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.isLoading = false
        state.error = (action.payload as string) ?? 'Failed to load notifications'
      })
  },
})

export const { setStatusFilter, setPage, setLimit, upsertNotification } = notificationSlice.actions

export const selectNotifications = (state: RootState) => state.notification.items

export default notificationSlice.reducer
