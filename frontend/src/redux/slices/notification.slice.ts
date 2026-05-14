import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { fetchNotifications } from '../thunks/notification.thunks'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'
import type { NotificationStatus } from '@/enum/notification-status.enum'
import type { RootState } from '../store'

interface NotificationState {
  items: NotificationRequest[]
  statusFilter: NotificationStatus | 'all'
  isLoading: boolean
  error: string | null
}

const initialState: NotificationState = {
  items: [],
  statusFilter: 'all',
  isLoading: false,
  error: null,
}

export const notificationSlice = createSlice({
  name: 'notification',
  initialState,
  reducers: {
    setStatusFilter(state, action: PayloadAction<NotificationStatus | 'all'>) {
      state.statusFilter = action.payload
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
        state.items = action.payload
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.isLoading = false
        state.error = (action.payload as string) ?? 'Failed to load notifications'
      })
  },
})

export const { setStatusFilter, upsertNotification } = notificationSlice.actions

export const selectNotifications = (state: RootState) => state.notification.items

export default notificationSlice.reducer
