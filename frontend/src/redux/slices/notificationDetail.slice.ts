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
import { selectTenant } from './tenant.slice'
import { isStaleResponse } from '../utils/latestRequest'

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
  /** Request ids of the fetches currently being awaited; see utils/latestRequest. */
  currentRequestId: string | null
  requestFetchId: string | null
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
  currentRequestId: null,
  requestFetchId: null,
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
      // A notification request belongs to one tenant, so neither the request header nor
      // its delivery rows can survive a tenant switch.
      // Every page holding this data refetches on tenant change, so the reset marks the
      // slice as loading rather than briefly rendering an empty table between the two.
      .addCase(selectTenant, () => ({ ...initialState, isLoading: true }))
      .addCase(fetchNotificationDetails.pending, (state, action) => {
        state.isLoading = true
        state.error = null
        state.currentRequestId = action.meta.requestId
      })
      .addCase(fetchNotificationDetails.fulfilled, (state, action) => {
        if (isStaleResponse(state.currentRequestId, action)) return
        state.items = action.payload.data
        state.count = action.payload.count
        state.page = action.payload.page
        state.limit = action.payload.limit
        state.totalPages = action.payload.totalPages
        state.isLoading = false
        state.hasLoaded = true
        state.currentRequestId = null
      })
      .addCase(fetchNotificationDetails.rejected, (state, action) => {
        if (isStaleResponse(state.currentRequestId, action)) return
        state.isLoading = false
        state.error = action.payload ?? 'Failed to load notification details'
        state.currentRequestId = null
      })
      .addCase(fetchNotificationRequest.pending, (state, action) => {
        state.requestFetchId = action.meta.requestId
      })
      .addCase(fetchNotificationRequest.fulfilled, (state, action) => {
        if (isStaleResponse(state.requestFetchId, action)) return
        state.notificationRequest = action.payload
        state.requestFetchId = null
      })
  },
})

export const { setPage, setLimit, setSearch, setSort, setFilter } = notificationDetailSlice.actions

export default notificationDetailSlice.reducer
