import { createAsyncThunk } from '@reduxjs/toolkit'
import { notificationApi } from '@/api/notification.api'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'
import type { RootState, AppDispatch } from '../store'
import { upsertNotification } from '../slices/notification.slice'

export const fetchNotifications = createAsyncThunk<
  NotificationRequest[],
  void,
  { state: RootState; rejectValue: string }
>('notification/fetchAll', async (_, { getState, rejectWithValue }) => {
  try {
    const state = getState()
    const status = state.notification.statusFilter
    const selectedTenant = state.tenant.selectedTenant
    const tenantId = selectedTenant?.id
    const response = await notificationApi.listNotifications(tenantId!, status)
    // Extract the data array from the paginated response
    return (response.data || response) as NotificationRequest[]
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
