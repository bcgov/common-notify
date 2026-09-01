import { createSlice } from '@reduxjs/toolkit'
import type { SafelistEntry } from '@/interfaces/safelist.interface'
import { addSafelistEntry, fetchSafelist, removeSafelistEntry } from '../thunks/safelist.thunks'
import { selectTenant } from './tenant.slice'
import { isStaleResponse } from '../utils/latestRequest'

interface SafelistState {
  entries: SafelistEntry[]
  /** Whether this environment enforces the safelist. False in production. */
  enforced: boolean
  maxEntries: number
  loading: boolean
  saving: boolean
  error?: string
  /** Request id of the fetch currently being awaited; see utils/latestRequest. */
  currentRequestId: string | null
}

const initialState: SafelistState = {
  entries: [],
  enforced: false,
  maxEntries: 0,
  loading: false,
  saving: false,
  currentRequestId: null,
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
      // The safelist is per-tenant; drop the previous tenant's recipients rather than
      // leaving them on screen under the new tenant while the refetch is in flight.
      // Every page holding this data refetches on tenant change, so the reset marks the
      // slice as loading rather than briefly rendering an empty table between the two.
      .addCase(selectTenant, () => ({ ...initialState, loading: true }))
      .addCase(fetchSafelist.pending, (state, action) => {
        state.loading = true
        state.error = undefined
        state.currentRequestId = action.meta.requestId
      })
      .addCase(fetchSafelist.fulfilled, (state, action) => {
        // Also stops a slow load from clobbering an add/remove that has already applied.
        if (isStaleResponse(state.currentRequestId, action)) return
        state.entries = action.payload?.entries ?? []
        state.enforced = action.payload?.enforced ?? false
        state.maxEntries = action.payload?.maxEntries ?? 0
        state.loading = false
        state.currentRequestId = null
      })
      .addCase(fetchSafelist.rejected, (state, action) => {
        if (isStaleResponse(state.currentRequestId, action)) return
        state.loading = false
        state.error = action.payload ?? 'Failed to load the safelist'
        state.currentRequestId = null
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
