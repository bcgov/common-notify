import { describe, it, expect } from 'vitest'
import { toastSlice, showToast, removeToast, clearToasts } from '@/redux/slices/toast.slice'
import type { Toast } from '@/redux/slices/toast.slice'

describe('Toast Slice', () => {
  interface ToastState {
    toasts: Toast[]
  }

  const initialState: ToastState = {
    toasts: [],
  }

  describe('showToast', () => {
    it('should add a toast to the list', () => {
      const toast = { message: 'Success!' }
      const state = toastSlice.reducer(initialState, showToast(toast))

      expect(state.toasts).toHaveLength(1)
      expect(state.toasts[0].message).toBe('Success!')
      expect(state.toasts[0].id).toBeDefined()
    })

    it('should generate an ID if not provided', () => {
      const toast = { message: 'Test' }
      const state = toastSlice.reducer(initialState, showToast(toast))

      expect(state.toasts[0].id).toBeDefined()
      expect(typeof state.toasts[0].id).toBe('string')
    })

    it('should use provided ID if given', () => {
      const toast = { message: 'Test', id: 'custom-id' }
      const state = toastSlice.reducer(initialState, showToast(toast))

      expect(state.toasts[0].id).toBe('custom-id')
    })

    it('should add multiple toasts', () => {
      let state = initialState
      state = toastSlice.reducer(state, showToast({ message: 'Toast 1' }))
      state = toastSlice.reducer(state, showToast({ message: 'Toast 2' }))
      state = toastSlice.reducer(state, showToast({ message: 'Toast 3' }))

      expect(state.toasts).toHaveLength(3)
    })

    it('should preserve toast type', () => {
      const toast = { message: 'Error!', type: 'error' as const }
      const state = toastSlice.reducer(initialState, showToast(toast))

      expect(state.toasts[0].type).toBe('error')
    })
  })

  describe('removeToast', () => {
    it('should remove a toast by ID', () => {
      let state = initialState
      state = toastSlice.reducer(state, showToast({ message: 'Toast 1', id: 'id-1' }))
      state = toastSlice.reducer(state, showToast({ message: 'Toast 2', id: 'id-2' }))

      state = toastSlice.reducer(state, removeToast('id-1'))

      expect(state.toasts).toHaveLength(1)
      expect(state.toasts[0].id).toBe('id-2')
    })

    it('should handle removing non-existent toast', () => {
      let state = initialState
      state = toastSlice.reducer(state, showToast({ message: 'Toast 1', id: 'id-1' }))

      state = toastSlice.reducer(state, removeToast('non-existent'))

      expect(state.toasts).toHaveLength(1)
    })

    it('should remove only the specified toast', () => {
      let state = initialState
      state = toastSlice.reducer(state, showToast({ message: 'Toast 1', id: 'id-1' }))
      state = toastSlice.reducer(state, showToast({ message: 'Toast 2', id: 'id-2' }))
      state = toastSlice.reducer(state, showToast({ message: 'Toast 3', id: 'id-3' }))

      state = toastSlice.reducer(state, removeToast('id-2'))

      expect(state.toasts).toHaveLength(2)
      expect(state.toasts.map((t) => t.id)).toEqual(['id-1', 'id-3'])
    })
  })

  describe('clearToasts', () => {
    it('should remove all toasts', () => {
      let state = initialState
      state = toastSlice.reducer(state, showToast({ message: 'Toast 1', id: 'id-1' }))
      state = toastSlice.reducer(state, showToast({ message: 'Toast 2', id: 'id-2' }))
      state = toastSlice.reducer(state, showToast({ message: 'Toast 3', id: 'id-3' }))

      state = toastSlice.reducer(state, clearToasts())

      expect(state.toasts).toHaveLength(0)
    })

    it('should handle clearing empty state', () => {
      const state = toastSlice.reducer(initialState, clearToasts())

      expect(state.toasts).toHaveLength(0)
    })
  })

  describe('Real-world scenario', () => {
    it('should handle a typical toast flow', () => {
      let state = initialState

      // Show success toast
      state = toastSlice.reducer(state, showToast({ message: 'Saved!', type: 'success' }))
      expect(state.toasts).toHaveLength(1)

      // Show another toast
      state = toastSlice.reducer(state, showToast({ message: 'Uploading...', type: 'info' }))
      expect(state.toasts).toHaveLength(2)

      // Remove the first one
      const firstToastId = state.toasts[0].id
      state = toastSlice.reducer(state, removeToast(firstToastId!))
      expect(state.toasts).toHaveLength(1)
      expect(state.toasts[0].message).toBe('Uploading...')

      // Clear all
      state = toastSlice.reducer(state, clearToasts())
      expect(state.toasts).toHaveLength(0)
    })
  })
})
