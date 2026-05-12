import { createSlice } from '@reduxjs/toolkit'
import type { TemplateResponse } from '@/api/templates.api'
import { fetchTemplates } from '../thunks/templates.thunks'

interface TemplatesState {
  items: TemplateResponse[]
  isLoading: boolean
  error: string | null
}

const initialState: TemplatesState = {
  items: [],
  isLoading: false,
  error: null,
}

export const templatesSlice = createSlice({
  name: 'templates',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTemplates.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchTemplates.fulfilled, (state, action) => {
        state.items = action.payload
        state.isLoading = false
      })
      .addCase(fetchTemplates.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload ?? 'Failed to load templates'
      })
  },
})

export default templatesSlice.reducer
