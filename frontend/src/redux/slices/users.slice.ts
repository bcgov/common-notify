import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { getAllUsersAsync } from '../thunks/user.thunks'
import type { UserResponse } from '@/interfaces/User'

interface UsersState {
  allUsers: UserResponse[]
  isLoading: boolean
  error: string | null
}

const initialState: UsersState = {
  allUsers: [],
  isLoading: false,
  error: null,
}

/**
 * Users slice for system-wide user lookups
 * Persists across logout to support audit trail displays
 */
export const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Get all users
      .addCase(getAllUsersAsync.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(getAllUsersAsync.fulfilled, (state, action: PayloadAction<UserResponse[]>) => {
        state.allUsers = action.payload
        state.isLoading = false
        state.error = null
      })
      .addCase(getAllUsersAsync.rejected, (state, action) => {
        state.isLoading = false
        state.error =
          (typeof action.payload === 'string' ? action.payload : null) || 'Failed to fetch users'
      })
  },
})

export const { clearError } = usersSlice.actions
export default usersSlice.reducer
