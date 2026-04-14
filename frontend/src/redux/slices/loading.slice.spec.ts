import { describe, it, expect } from 'vitest'
import { loadingSlice } from '@/redux/slices/loading.slice'

describe('Loading Slice', () => {
  const initialState = {
    isLoading: false,
    requestCount: 0,
  }

  describe('showLoading', () => {
    it('should set isLoading to true', () => {
      const state = loadingSlice.reducer(initialState, loadingSlice.actions.showLoading())

      expect(state.isLoading).toBe(true)
    })
  })

  describe('hideLoading', () => {
    it('should set isLoading to false when no requests are pending', () => {
      const state = { isLoading: true, requestCount: 0 }
      const newState = loadingSlice.reducer(state, loadingSlice.actions.hideLoading())

      expect(newState.isLoading).toBe(false)
    })

    it('should keep isLoading true when requests are still pending', () => {
      const state = { isLoading: true, requestCount: 2 }
      const newState = loadingSlice.reducer(state, loadingSlice.actions.hideLoading())

      expect(newState.isLoading).toBe(true)
    })
  })

  describe('incrementRequest', () => {
    it('should increment requestCount', () => {
      const state = loadingSlice.reducer(initialState, loadingSlice.actions.incrementRequest())

      expect(state.requestCount).toBe(1)
    })

    it('should increment multiple times', () => {
      let state = initialState
      state = loadingSlice.reducer(state, loadingSlice.actions.incrementRequest())
      state = loadingSlice.reducer(state, loadingSlice.actions.incrementRequest())
      state = loadingSlice.reducer(state, loadingSlice.actions.incrementRequest())

      expect(state.requestCount).toBe(3)
    })
  })

  describe('decrementRequest', () => {
    it('should decrement requestCount', () => {
      const state = { isLoading: false, requestCount: 3 }
      const newState = loadingSlice.reducer(state, loadingSlice.actions.decrementRequest())

      expect(newState.requestCount).toBe(2)
    })

    it('should not go below 0', () => {
      const state = initialState
      const newState = loadingSlice.reducer(state, loadingSlice.actions.decrementRequest())

      expect(newState.requestCount).toBe(0)
    })

    it('should handle multiple decrements', () => {
      let state = { isLoading: false, requestCount: 3 }
      state = loadingSlice.reducer(state, loadingSlice.actions.decrementRequest())
      state = loadingSlice.reducer(state, loadingSlice.actions.decrementRequest())

      expect(state.requestCount).toBe(1)
    })
  })

  describe('resetLoading', () => {
    it('should reset isLoading and requestCount', () => {
      const state = { isLoading: true, requestCount: 5 }
      const newState = loadingSlice.reducer(state, loadingSlice.actions.resetLoading())

      expect(newState.isLoading).toBe(false)
      expect(newState.requestCount).toBe(0)
    })
  })

  describe('Real-world scenario', () => {
    it('should handle multiple concurrent requests', () => {
      let state = initialState

      // First request starts
      state = loadingSlice.reducer(state, loadingSlice.actions.incrementRequest())
      state = loadingSlice.reducer(state, loadingSlice.actions.showLoading())
      expect(state.isLoading).toBe(true)
      expect(state.requestCount).toBe(1)

      // Second request starts
      state = loadingSlice.reducer(state, loadingSlice.actions.incrementRequest())
      expect(state.requestCount).toBe(2)

      // First request completes
      state = loadingSlice.reducer(state, loadingSlice.actions.decrementRequest())
      state = loadingSlice.reducer(state, loadingSlice.actions.hideLoading())
      expect(state.isLoading).toBe(true) // Still loading because requestCount > 0
      expect(state.requestCount).toBe(1)

      // Second request completes
      state = loadingSlice.reducer(state, loadingSlice.actions.decrementRequest())
      state = loadingSlice.reducer(state, loadingSlice.actions.hideLoading())
      expect(state.isLoading).toBe(false) // Now loading is done
      expect(state.requestCount).toBe(0)
    })
  })
})
