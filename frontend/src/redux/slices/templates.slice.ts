import { createSlice } from '@reduxjs/toolkit'
import { fetchTemplates } from '../thunks/templates.thunks'
import type { TemplateResponse } from '@/api/templates.api'

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
        state.isLoading = false
        state.items = action.payload
      })
      .addCase(fetchTemplates.rejected, (state, action) => {
        state.isLoading = false
        state.error = (action.payload as string) ?? 'Failed to load templates'
      })
  },
})

export default templatesSlice.reducer
