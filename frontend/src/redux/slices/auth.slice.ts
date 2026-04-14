import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { initializeAuthFromToken } from '../thunks/auth.thunks'
import type { AuthUser } from '@/interfaces/AuthUser'

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isInitializing: boolean
  error: string | null
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isInitializing: true,
  error: null,
}

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<AuthUser>) => {
      state.user = action.payload
      state.isAuthenticated = true
      state.error = null
    },
    clearUser: (state) => {
      state.user = null
      state.isAuthenticated = false
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeAuthFromToken.pending, (state) => {
        state.isInitializing = true
      })
      .addCase(initializeAuthFromToken.fulfilled, (state, action) => {
        state.user = action.payload
        state.isAuthenticated = !!action.payload
        state.isInitializing = false
        state.error = null
      })
      .addCase(initializeAuthFromToken.rejected, (state, action) => {
        state.isInitializing = false
        state.error = action.payload || 'Failed to initialize auth'
        state.user = null
        state.isAuthenticated = false
      })
  },
})

export const { setUser, clearUser, setError } = authSlice.actions
export default authSlice.reducer
