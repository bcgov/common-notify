import { createAsyncThunk } from '@reduxjs/toolkit'
import { notificationApi } from '@/api'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'
import type { RootState } from '../store'

export const fetchNotifications = createAsyncThunk<
  NotificationRequest[],
  void,
  { state: RootState; rejectValue: string }
>('notification/fetchAll', async (_, { rejectWithValue }) => {
  try {
    return await notificationApi.listNotifications()
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load notifications')
  }
})
