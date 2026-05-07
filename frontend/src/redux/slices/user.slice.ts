import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { upsertCurrentUserAsync, getAllUsersAsync } from '../thunks/user.thunks'
import type { UserResponse } from '@/interfaces/User'

interface UserState {
  current: UserResponse | null
  allUsers: UserResponse[]
  isLoading: boolean
  error: string | null
}

const initialState: UserState = {
  current: null,
  allUsers: [],
  isLoading: false,
  error: null,
}

export const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    clearCurrentUser: (state) => {
      state.current = null
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      // Upsert current user
      .addCase(upsertCurrentUserAsync.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(upsertCurrentUserAsync.fulfilled, (state, action) => {
        state.current = action.payload
        state.isLoading = false
        state.error = null
      })
      .addCase(upsertCurrentUserAsync.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload || 'Failed to upsert user'
      })
      // Get all users
      .addCase(getAllUsersAsync.pending, (state) => {
        state.isLoading = true
        state.error = null
      })
      .addCase(getAllUsersAsync.fulfilled, (state, action) => {
        state.allUsers = action.payload
        state.isLoading = false
        state.error = null
      })
      .addCase(getAllUsersAsync.rejected, (state, action) => {
        state.isLoading = false
        state.error = action.payload || 'Failed to fetch users'
      })
  },
})

export const { clearCurrentUser, setError } = userSlice.actions
export default userSlice.reducer
