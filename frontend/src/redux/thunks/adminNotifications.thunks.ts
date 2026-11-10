import { createAsyncThunk } from '@reduxjs/toolkit'
import { listAdminNotifications } from '@/api/adminNotifications.api'
import type { AdminNotificationRow } from '@/api/adminNotifications.api'
import type { PaginatedResponse } from '@/interfaces/PaginatedNotificationResponse'
import { toFilterParams } from '../utils/listFilters'
import type { RootState } from '../store'

/** Local midnight at the start of a YYYY-MM-DD day, as an ISO instant. */
const startOfDay = (day: string) => new Date(`${day}T00:00:00`).toISOString()
/** The last millisecond of a YYYY-MM-DD day, local time, as an ISO instant. */
const endOfDay = (day: string) => new Date(`${day}T23:59:59.999`).toISOString()

/** The admin Notifications list, read from the slice's query state. */
export const fetchAdminNotifications = createAsyncThunk<
  PaginatedResponse<AdminNotificationRow>,
  void,
  { state: RootState; rejectValue: string }
>('adminNotifications/fetchAll', async (_, { getState, rejectWithValue }) => {
  try {
    const { page, limit, search, filters, from, to } = getState().adminNotifications
    const filter = toFilterParams(filters) ?? []
    if (from) filter.push(`createdAt:gte:${startOfDay(from)}`)
    if (to) filter.push(`createdAt:lte:${endOfDay(to)}`)
    return await listAdminNotifications({ page, limit, search: search || undefined, filter })
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to load notifications')
  }
})
