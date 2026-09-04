import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { EventResponse } from '@/api/events.api'
import { fetchEvents } from '../thunks/events.thunks'

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
      .addCase(fetchEvents.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchEvents.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.count = action.payload.count
        state.page = action.payload.page
        state.limit = action.payload.limit
        state.totalPages = action.payload.totalPages
        state.isLoading = false
        state.hasLoaded = true
      })
      .addCase(fetchEvents.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload ?? 'Failed to load events'
      })
  },
})

export const { setPage, setLimit, setSearch, setSort, setFilter } = eventsSlice.actions

export default eventsSlice.reducer
