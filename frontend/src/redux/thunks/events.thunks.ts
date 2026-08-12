import { createAsyncThunk } from '@reduxjs/toolkit'
import { getEvents } from '@/api/events.api'
import type { PaginatedEventResponse } from '@/interfaces/PaginatedNotificationResponse'
import type { RootState } from '../store'

export const fetchEvents = createAsyncThunk<
  PaginatedEventResponse,
  void,
  { state: RootState; rejectValue: string }
>('events/fetchAll', async (_, { getState, rejectWithValue }) => {
  try {
    const state = getState()
    const tenantId = state.tenant.selectedTenant?.id
    if (!tenantId) return { data: [], count: 0, page: 1, limit: 15, totalPages: 0 }
    const { page, limit, search, sortBy, sortOrder, filters } = state.events

    const sort =
      sortBy != null && sortOrder != null
        ? sortOrder === 'desc'
          ? `-${sortBy}`
          : sortBy
        : undefined

    const filter = Object.entries(filters)
      .filter(([, values]) => values.length > 0)
      .map(([field, values]) => `${field}:in:${values.join('|')}`)

    return await getEvents(
      page,
      limit,
      search || undefined,
      sort,
      filter.length > 0 ? filter : undefined,
    )
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load events')
  }
})
