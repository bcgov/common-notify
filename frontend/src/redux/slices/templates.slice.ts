import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { TemplateResponse } from '@/api/templates.api'
import { fetchTemplates } from '../thunks/templates.thunks'

const PREVIEW_VALUES_STORAGE_KEY = 'notify_template_preview_values'

function loadPreviewValues(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(PREVIEW_VALUES_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

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
  previewValues: loadPreviewValues(),
  isLoading: false,
  hasLoaded: false,
  error: null,
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
      try {
        sessionStorage.setItem(PREVIEW_VALUES_STORAGE_KEY, JSON.stringify(state.previewValues))
      } catch {
        /* storage unavailable — keep in-memory value only */
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTemplates.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchTemplates.fulfilled, (state, action) => {
        state.items = action.payload.data
        state.count = action.payload.count
        state.page = action.payload.page
        state.limit = action.payload.limit
        state.totalPages = action.payload.totalPages
        state.isLoading = false
        state.hasLoaded = true
      })
      .addCase(fetchTemplates.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload ?? 'Failed to load templates'
      })
  },
})

export const { setPage, setLimit, setSearch, setSort, setFilter, setPreviewValues } =
  templatesSlice.actions

export default templatesSlice.reducer
