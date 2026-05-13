import { createAsyncThunk } from '@reduxjs/toolkit'
import { notificationApi } from '@/api'
import type { PaginatedNotificationResponse } from '@/interfaces/PaginatedNotificationResponse'
import type { RootState, AppDispatch } from '../store'
import { upsertNotification } from '../slices/notification.slice'

export const fetchNotifications = createAsyncThunk<
  PaginatedNotificationResponse,
  void,
  { state: RootState; rejectValue: string }
>('notification/fetchAll', async (_, { getState, rejectWithValue }) => {
  try {
    const state = getState()
    const { statusFilter, page, limit } = state.notification
    return await notificationApi.listNotifications({ page, limit, status: statusFilter })
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load notifications')
  }
})

/** Connects to the notification SSE stream and dispatches upsertNotification for each event. */
export function connectNotificationSSE(dispatch: AppDispatch): AbortController {
  return notificationApi.connectNotificationStream(
    (dto) => dispatch(upsertNotification(dto)),
    (err) => console.error('SSE connection error', err),
  )
}
