import { createSlice } from '@reduxjs/toolkit'
import type { SafelistEntry } from '@/interfaces/safelist.interface'
import { addSafelistEntry, fetchSafelist, removeSafelistEntry } from '../thunks/safelist.thunks'

interface SafelistState {
  entries: SafelistEntry[]
  /** Whether this environment enforces the safelist. False in production. */
  enforced: boolean
  maxEntries: number
  loading: boolean
  saving: boolean
  error?: string
}

const initialState: SafelistState = {
  entries: [],
  enforced: false,
  maxEntries: 0,
  loading: false,
  saving: false,
}

const sortEntries = (entries: SafelistEntry[]): SafelistEntry[] =>
  [...entries].sort(
    (a, b) =>
      a.channelCode.localeCompare(b.channelCode) ||
      a.recipientNormalized.localeCompare(b.recipientNormalized),
  )

export const safelistSlice = createSlice({
  name: 'safelist',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSafelist.pending, (state) => {
        state.loading = true
        state.error = undefined
      })
      .addCase(fetchSafelist.fulfilled, (state, action) => {
        state.entries = action.payload?.entries ?? []
        state.enforced = action.payload?.enforced ?? false
        state.maxEntries = action.payload?.maxEntries ?? 0
        state.loading = false
      })
      .addCase(fetchSafelist.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload ?? 'Failed to load the safelist'
      })
      .addCase(addSafelistEntry.pending, (state) => {
        state.saving = true
        state.error = undefined
      })
      .addCase(addSafelistEntry.fulfilled, (state, action) => {
        state.entries = sortEntries([...state.entries, action.payload])
        state.saving = false
      })
      .addCase(addSafelistEntry.rejected, (state, action) => {
        state.saving = false
        state.error = action.payload ?? 'Failed to add the recipient'
      })
      .addCase(removeSafelistEntry.pending, (state) => {
        state.saving = true
        state.error = undefined
      })
      .addCase(removeSafelistEntry.fulfilled, (state, action) => {
        state.entries = state.entries.filter((entry) => entry.id !== action.payload)
        state.saving = false
      })
      .addCase(removeSafelistEntry.rejected, (state, action) => {
        state.saving = false
        state.error = action.payload ?? 'Failed to remove the recipient'
      })
  },
})

export default safelistSlice.reducer
