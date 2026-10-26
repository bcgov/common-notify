import type { PayloadAction } from '@reduxjs/toolkit'
import { createSlice } from '@reduxjs/toolkit'
import type { CodeTable, CodeTablesState } from '@/interfaces/CodeTables'
import type { RootState } from '../store'
import { fetchCodeTables } from '../thunks/codeTables.thunks'

export type { CodeTable, CodeTablesState }

const initialState: CodeTablesState = {
  statuses: [],
  channels: [],
  eventTypes: [],
  isLoading: false,
  error: null,
}

const codeTablesSlice = createSlice({
  name: 'codeTables',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCodeTables.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(fetchCodeTables.fulfilled, (state, action: PayloadAction<CodeTablesState>) => {
        state.isLoading = false
        state.statuses = action.payload.statuses
        state.channels = action.payload.channels
        state.eventTypes = action.payload.eventTypes
      })
      .addCase(fetchCodeTables.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload as string
      })
  },
})

export const { clearError } = codeTablesSlice.actions

// Selectors
export const selectStatuses = (state: RootState) => state.codeTables.statuses

export const selectChannels = (state: RootState) => state.codeTables.channels

export const selectEventTypes = (state: RootState) => state.codeTables.eventTypes

export const selectCodeTablesLoading = (state: RootState) => state.codeTables.isLoading

export const selectCodeTablesError = (state: RootState) => state.codeTables.error

export default codeTablesSlice.reducer
