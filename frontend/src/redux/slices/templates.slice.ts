import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { TemplateResponse } from '@/api/templates.api'
import { fetchTemplates } from '../thunks/templates.thunks'
import { selectTenant } from './tenant.slice'
import { isStaleResponse } from '../utils/latestRequest'

interface TemplatesState {
  items: TemplateResponse[]
  page: number
  limit: number
  count: number
  totalPages: number
  search: string
  sortBy: string | null
  sortOrder: 'asc' | 'desc' | null
  filters: Record<string, string[]>
  previewValues: Record<string, string>
  isLoading: boolean
  hasLoaded: boolean
  error: string | null
  /** Request id of the fetch currently being awaited; see utils/latestRequest. */
  currentRequestId: string | null
}

const initialState: TemplatesState = {
  items: [],
  page: 1,
  limit: 15,
  count: 0,
  totalPages: 0,
  search: '',
  sortBy: null,
  sortOrder: null,
  filters: {},
  previewValues: {},
  isLoading: false,
  hasLoaded: false,
  error: null,
  currentRequestId: null,
}

export const templatesSlice = createSlice({
  name: 'templates',
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
    setPreviewValues(state, action: PayloadAction<Record<string, string>>) {
      state.previewValues = { ...state.previewValues, ...action.payload }
    },
  },
  extraReducers: (builder) => {
    builder
      // A tenant switch invalidates everything here: rows, paging and the query that
      // produced them all belonged to the previous tenant. Resetting drops the stale
      // rows and clears hasLoaded, so the table shows its loading state rather than
      // Tenant A's templates under Tenant B's name while the refetch is in flight.
      // Every page holding this data refetches on tenant change, so the reset marks the
      // slice as loading rather than briefly rendering an empty table between the two.
      .addCase(selectTenant, () => ({ ...initialState, isLoading: true }))
      .addCase(fetchTemplates.pending, (state, action) => {
        state.isLoading = true
        state.error = null
        state.currentRequestId = action.meta.requestId
      })
      .addCase(fetchTemplates.fulfilled, (state, action) => {
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
      .addCase(fetchTemplates.rejected, (state, action) => {
        if (isStaleResponse(state.currentRequestId, action)) return
        state.isLoading = false
        state.error = action.payload ?? 'Failed to load templates'
        state.currentRequestId = null
      })
  },
})

export const { setPage, setLimit, setSearch, setSort, setFilter, setPreviewValues } =
  templatesSlice.actions

export default templatesSlice.reducer
