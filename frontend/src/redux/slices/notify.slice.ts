import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { sendSimpleNotify, getNotificationStatus, listNotifications } from '../thunks/notify.thunks'

interface NotifyState {
  loading: boolean
  error: string | null
  notifications: any[]
  currentNotification: any | null
  lastSentNotification: any | null
}

const initialState: NotifyState = {
  loading: false,
  error: null,
  notifications: [],
  currentNotification: null,
  lastSentNotification: null,
}

export const notifySlice = createSlice({
  name: 'notify',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    clearNotifications: (state) => {
      state.notifications = []
      state.currentNotification = null
    },
    setNotifications: (state, action: PayloadAction<any[]>) => {
      state.notifications = action.payload
    },
  },
  extraReducers: (builder) => {
    // Send Simple Notify
    builder
      .addCase(sendSimpleNotify.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(sendSimpleNotify.fulfilled, (state, action) => {
        state.loading = false
        state.lastSentNotification = action.payload
        state.error = null
      })
      .addCase(sendSimpleNotify.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload || 'Failed to send notification'
      })

    // Get Notification Status
    builder
      .addCase(getNotificationStatus.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(getNotificationStatus.fulfilled, (state, action) => {
        state.loading = false
        state.currentNotification = action.payload
        state.error = null
      })
      .addCase(getNotificationStatus.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload || 'Failed to fetch notification status'
      })

    // List Notifications
    builder
      .addCase(listNotifications.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(listNotifications.fulfilled, (state, action) => {
        state.loading = false
        state.notifications = action.payload.notifications || action.payload
        state.error = null
      })
      .addCase(listNotifications.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload || 'Failed to fetch notifications'
      })
  },
})

export const { clearError, clearNotifications, setNotifications } = notifySlice.actions
export default notifySlice.reducer
