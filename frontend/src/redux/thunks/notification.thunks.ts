import { createAsyncThunk } from '@reduxjs/toolkit'
import { notificationApi } from '@/api'
import type { PaginatedNotificationResponse } from '@/interfaces/PaginatedNotificationResponse'
import type { RootState, AppDispatch } from '../store'

export const fetchNotifications = createAsyncThunk<
  PaginatedNotificationResponse,
  void,
  { state: RootState; rejectValue: string }
>('notification/fetchAll', async (_, { getState, rejectWithValue }) => {
  try {
    const state = getState()
    const { page, limit, sortBy, sortOrder, filters } = state.notification

    const sort =
      sortBy != null && sortOrder != null
        ? sortOrder === 'desc'
          ? `-${sortBy}`
          : sortBy
        : undefined

    const filter = Object.entries(filters)
      .filter(([, values]) => values.length > 0)
      .map(([field, values]) => `${field}:in:${values.join('|')}`)

    return await notificationApi.listNotifications({
      page,
      limit,
      sort,
      filter: filter.length > 0 ? filter : undefined,
    })
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load notifications')
  }
})

/** Connects to the notification SSE stream and refetches the current page on each event. */
export function connectNotificationSSE(dispatch: AppDispatch, tenantId?: string): AbortController {
  return notificationApi.connectNotificationStream(
    () => dispatch(fetchNotifications()),
    (err) => console.error('SSE connection error', err),
    tenantId,
  )
}
