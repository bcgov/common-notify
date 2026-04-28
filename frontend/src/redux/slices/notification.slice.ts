import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { fetchNotifications } from '../thunks/notification.thunks'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'
import { NotificationStatus } from '@/enum/notification-status.enum'
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

export const { setStatusFilter } = notificationSlice.actions

export const selectFilteredNotifications = (state: RootState) => {
  const { items, statusFilter } = state.notification
  if (statusFilter === 'all') return items
  return items.filter((n) => n.status === statusFilter)
}

export default notificationSlice.reducer
