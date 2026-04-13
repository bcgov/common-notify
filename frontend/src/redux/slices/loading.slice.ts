import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

interface LoadingState {
  isLoading: boolean
  requestCount: number
}

const initialState: LoadingState = {
  isLoading: false,
  requestCount: 0,
}

export const loadingSlice = createSlice({
  name: 'loading',
  initialState,
  reducers: {
    /**
     * Increment request counter when API call starts
     * Only show loading after 0.5s delay (handled in thunks)
     */
    incrementRequest: (state) => {
      state.requestCount += 1
    },

    /**
     * Decrement request counter when API call completes
     */
    decrementRequest: (state) => {
      state.requestCount = Math.max(0, state.requestCount - 1)
    },

    /**
     * Show loading spinner immediately (called after 0.5s timeout)
     */
    showLoading: (state) => {
      state.isLoading = true
    },

    /**
     * Hide loading spinner when all requests complete
     */
    hideLoading: (state) => {
      state.isLoading = state.requestCount > 0
    },

    /**
     * Reset loading state (for cleanup)
     */
    resetLoading: (state) => {
      state.isLoading = false
      state.requestCount = 0
    },
  },
})

export const { incrementRequest, decrementRequest, showLoading, hideLoading, resetLoading } =
  loadingSlice.actions
export default loadingSlice.reducer
