import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { TemplateResponse } from '@/api/templates.api'
import { fetchTemplates } from '../thunks/templates.thunks'

interface TemplatesState {
  items: TemplateResponse[]
  page: number
  limit: number
  count: number
  totalPages: number
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

export const { setPage, setLimit } = templatesSlice.actions

export default templatesSlice.reducer
