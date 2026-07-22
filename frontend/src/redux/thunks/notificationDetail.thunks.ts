import { createAsyncThunk } from '@reduxjs/toolkit'
import { notificationApi } from '@/api'
import type { PaginatedNotificationDetailResponse } from '@/interfaces/PaginatedNotificationResponse'
import type { RootState } from '../store'

export const fetchNotificationDetails = createAsyncThunk<
  PaginatedNotificationDetailResponse,
  string,
  { state: RootState; rejectValue: string }
>('notificationDetail/fetchAll', async (notificationRequestId, { getState, rejectWithValue }) => {
  try {
    const { page, limit, search, sortBy, sortOrder, filters } = getState().notificationDetail

    const sort =
      sortBy != null && sortOrder != null
        ? sortOrder === 'desc'
          ? `-${sortBy}`
          : sortBy
        : undefined

    const filter = Object.entries(filters)
      .filter(([, values]) => values.length > 0)
      .map(([field, values]) => `${field}:in:${values.join('|')}`)

    return await notificationApi.listRequestDetails(notificationRequestId, {
      page,
      limit,
      search: search || undefined,
      sort,
      filter: filter.length > 0 ? filter : undefined,
    })
  } catch (error) {
    return rejectWithValue(
      error instanceof Error ? error.message : 'Failed to load notification details',
    )
  }
})
