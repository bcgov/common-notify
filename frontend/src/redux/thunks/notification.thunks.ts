import { createAsyncThunk } from '@reduxjs/toolkit'
import { notificationApi } from '@/api'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'
import type { RootState } from '../store'

export const fetchNotifications = createAsyncThunk<
  NotificationRequest[],
  void,
  { state: RootState; rejectValue: string }
>('notification/fetchAll', async (_, { getState, rejectWithValue }) => {
  try {
    const state = getState()
    const status = state.notification.statusFilter
    const response = await notificationApi.listNotifications(status)
    // Extract the data array from the paginated response
    return (response.data || response) as NotificationRequest[]
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load notifications')
  }
})
