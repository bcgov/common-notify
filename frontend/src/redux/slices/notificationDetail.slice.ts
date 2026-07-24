import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type {
  NotificationRequest,
  NotificationRequestDetail,
} from '@/interfaces/NotificationRequest'
import {
  fetchNotificationDetails,
  fetchNotificationRequest,
} from '../thunks/notificationDetail.thunks'

interface NotificationDetailState {
  notificationRequest: NotificationRequest | null
  items: NotificationRequestDetail[]
  page: number
  limit: number
  count: number
  totalPages: number
  search: string
  sortBy: string | null
  sortOrder: 'asc' | 'desc' | null
  filters: Record<string, string[]>
  isLoading: boolean
  hasLoaded: boolean
  error: string | null
}

const initialState: NotificationDetailState = {
  notificationRequest: null,
  items: [],
  page: 1,
  limit: 15,
  count: 0,
  totalPages: 0,
  search: '',
  sortBy: null,
  sortOrder: null,
  filters: {},
  isLoading: false,
  hasLoaded: false,
  error: null,
}

export const notificationDetailSlice = createSlice({
  name: 'notificationDetail',
  initialState,
  reducers: {
    setPage(state, action: PayloadAction<number>) {
      state.page = Math.max(1, action.payload)
    },
    setLimit(state, action: PayloadAction<number>) {
      state.limit = action.payload
      state.page = 1
    },
    setSearch(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
    },
    setSort(
      state,
      action: PayloadAction<{ sortBy: string | null; sortOrder: 'asc' | 'desc' | null }>,
    ) {
      state.sortBy = action.payload.sortBy
      state.sortOrder = action.payload.sortOrder
      state.page = 1
    },
    setFilter(state, action: PayloadAction<{ field: string; values: string[] }>) {
      const { field, values } = action.payload
      if (values.length === 0) {
        delete state.filters[field]
      } else {
        state.filters[field] = values
      }
      state.page = 1
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotificationDetails.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchNotificationDetails.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.count = action.payload.count
        state.page = action.payload.page
        state.limit = action.payload.limit
        state.totalPages = action.payload.totalPages
        state.isLoading = false
        state.hasLoaded = true
      })
      .addCase(fetchNotificationDetails.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload ?? 'Failed to load notification details'
      })
      .addCase(fetchNotificationRequest.fulfilled, (state, action) => {
        state.notificationRequest = action.payload
      })
  },
})

export const { setPage, setLimit, setSearch, setSort, setFilter } = notificationDetailSlice.actions

export default notificationDetailSlice.reducer
