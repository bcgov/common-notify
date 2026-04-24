import { createSlice } from '@reduxjs/toolkit'
import { fetchNotifications } from '../thunks/notification.thunks'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'

interface NotificationState {
  items: NotificationRequest[]
  isLoading: boolean
  error: string | null
}

const initialState: NotificationState = {
  items: [],
  isLoading: false,
  error: null,
}

export const notificationSlice = createSlice({
  name: 'notification',
  initialState,
  reducers: {},
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
        state.error = action.payload ?? 'Failed to load notifications'
      })
  },
})

export default notificationSlice.reducer
