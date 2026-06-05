import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { upsertCurrentUserAsync } from '../thunks/user.thunks'
import { fetchCstarRoles } from '../thunks/cstar.thunks'
import type { UserResponse } from '@/interfaces/User'

interface UserState {
  current: UserResponse | null
  isLoading: boolean
  rolesLoading: boolean
  error: string | null
  rolesError: string | null
}

const initialState: UserState = {
  current: null,
  isLoading: false,
  rolesLoading: false,
  error: null,
  rolesError: null,
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
      // Fetch CSTAR roles
      .addCase(fetchCstarRoles.pending, (state) => {
        state.rolesLoading = true
        state.rolesError = null
      })
      .addCase(fetchCstarRoles.fulfilled, (state, action) => {
        if (state.current) {
          state.current.cstarRoles = action.payload
        }
        state.rolesLoading = false
        state.rolesError = null
      })
      .addCase(fetchCstarRoles.rejected, (state, action) => {
        state.rolesLoading = false
        state.rolesError = action.payload || 'Failed to fetch roles'
      })
  },
})

export const { clearCurrentUser, setError } = userSlice.actions
export default userSlice.reducer
