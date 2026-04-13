import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { ToastOptions } from 'react-toastify'

export interface Toast extends ToastOptions {
  id?: string
  message: string
  type?: 'success' | 'error' | 'info' | 'warning'
}

interface ToastState {
  toasts: Toast[]
}

const initialState: ToastState = {
  toasts: [],
}

export const toastSlice = createSlice({
  name: 'toast',
  initialState,
  reducers: {
    /**
     * Show a toast notification
     */
    showToast: (state, action: PayloadAction<Toast>) => {
      const toast = {
        ...action.payload,
        id: action.payload.id || `${Date.now()}-${Math.random()}`,
      }
      state.toasts.push(toast)
    },

    /**
     * Remove a toast notification by ID
     */
    removeToast: (state, action: PayloadAction<string>) => {
      state.toasts = state.toasts.filter((toast) => toast.id !== action.payload)
    },

    /**
     * Clear all toasts
     */
    clearToasts: (state) => {
      state.toasts = []
    },
  },
})

export const { showToast, removeToast, clearToasts } = toastSlice.actions
export default toastSlice.reducer
