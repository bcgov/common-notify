import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { fetchNotifications } from '../thunks/notification.thunks'
import type { NotificationStatus } from '@/enum/notification-status.enum'
import { MAX_NOTIFICATION_RESULTS_PER_PAGE } from '@/config/notification'
import type { RootState } from '../store'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'

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

export const { setStatusFilter, setPage } = notificationSlice.actions

export const selectNotifications = (state: RootState) => state.notification.items

export default notificationSlice.reducer
