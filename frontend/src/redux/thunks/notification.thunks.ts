import { createAsyncThunk } from '@reduxjs/toolkit'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { notificationApi } from '@/api'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'
import type { RootState, AppDispatch } from '../store'
import { upsertNotification } from '../slices/notification.slice'
import UserService from '@/service/user-service'

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

/**
 * Opens a persistent SSE connection to stream notification_request updates for the
 * authenticated tenant. Dispatches upsertNotification on each event.
 *
 * Returns an AbortController — call abort() to close the connection (e.g. on component unmount).
 */
export function connectNotificationSSE(dispatch: AppDispatch): AbortController {
  const controller = new AbortController()

  // Refreshes the Keycloak token before every (re)connect attempt,
  // preventing 401s when the access token expires during a long-lived connection.
  const fetchWithFreshToken = async (input: RequestInfo | URL, init?: RequestInit) => {
    await UserService.updateToken(() => true)
    const token = UserService.getToken()
    return fetch(input, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
    })
  }

  fetchEventSource('/api/v1/notification_request/events', {
    fetch: fetchWithFreshToken,
    signal: controller.signal,
    onmessage(event) {
      if (event.event === 'keepalive' || !event.data) return
      try {
        const dto = JSON.parse(event.data) as NotificationRequest
        dispatch(upsertNotification(dto))
      } catch (err) {
        console.error('Failed to parse SSE notification event', err)
      }
    },
    onerror(err) {
      console.error('SSE connection error', err)
      // Returning normally lets the library retry automatically
    },
  })
  return controller
}
