import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { EventResponse } from '@/api/events.api'
import { fetchEvents } from '../thunks/events.thunks'
import { selectTenant } from './tenant.slice'
import { isStaleResponse } from '../utils/latestRequest'

interface EventsState {
  items: EventResponse[]
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
  /** Request id of the fetch currently being awaited; see utils/latestRequest. */
  currentRequestId: string | null
}

const initialState: EventsState = {
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
}

export const eventsSlice = createSlice({
  name: 'events',
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
      // Events belong to a tenant, so switching tenants drops this one's rows, search term,
      // page and filters. Marked as loading rather than empty, so the table does not flash its
      // "No events found" message before the new tenant's fetch lands. Same as templates.slice.
      .addCase(selectTenant, () => ({ ...initialState, isLoading: true }))
      .addCase(fetchEvents.pending, (state, action) => {
        state.isLoading = true
        state.error = null
        state.currentRequestId = action.meta.requestId
      })
      .addCase(fetchEvents.fulfilled, (state, action) => {
        // A slower fetch for the previous tenant (or an earlier search) must not overwrite the
        // results of the one that replaced it.
        if (isStaleResponse(state.currentRequestId, action)) return
        state.items = action.payload.data
        state.count = action.payload.count
        state.page = action.payload.page
        state.limit = action.payload.limit
        state.totalPages = action.payload.totalPages
        state.isLoading = false
        state.hasLoaded = true
      })
      .addCase(fetchEvents.rejected, (state, action) => {
        if (isStaleResponse(state.currentRequestId, action)) return
        state.isLoading = false
        state.error = action.payload ?? 'Failed to load events'
      })
  },
})

export const { setPage, setLimit, setSearch, setSort, setFilter } = eventsSlice.actions

export default eventsSlice.reducer
