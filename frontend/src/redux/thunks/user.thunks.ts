import { createAsyncThunk } from '@reduxjs/toolkit'
import userApi from '@/api/user.api'
import type { AuthUser } from '@/interfaces/AuthUser'
import type { RootState } from '../store'

/**
 * Helper function to check if user data has changed
 * Compares key fields between stored user and incoming auth data
 */
function hasUserDataChanged(storedUser: any, authUser: AuthUser): boolean {
  const fieldsToCompare = ['email', 'username', 'displayName', 'givenName', 'familyName']

  for (const field of fieldsToCompare) {
    const storedValue = storedUser[field]
    const incomingValue = authUser[field as keyof AuthUser]

    // Use strict equality for comparison
    if (storedValue !== incomingValue) {
      return true
    }
  }

  return false
}

/**
 * Upsert current user (on login or profile refresh)
 * Takes AuthUser from JWT token and syncs with backend notify_user table
 *
 * Smart logic:
 * - Checks Redux users state to find existing user
 * - If user not found → creates new record
 * - If user found but data identical → skips API call (returns cached user)
 * - If user found but data changed → updates record
 */
export const upsertCurrentUserAsync = createAsyncThunk<
  any,
  AuthUser,
  {
    state: RootState
    rejectValue: string
  }
>('user/upsertCurrent', async (authUser: AuthUser, { rejectWithValue, getState }) => {
  try {
    const state = getState()
    const users = state.users.allUsers || []

    // Find existing user by matching the id (which is externalId from JWT)
    const existingUser = users.find((u: any) => u.externalId === authUser.id)

    // If user exists and data hasn't changed, return cached user without API call
    if (existingUser && !hasUserDataChanged(existingUser, authUser)) {
      return existingUser
    }

    const response = await userApi.upsertCurrentUser(authUser)
    return response.user
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upsert user'
    return rejectWithValue(message)
  }
})

/**
 * Get all users (populates Redux state for lookup)
 */
export const getAllUsersAsync = createAsyncThunk('user/getAll', async (_, { rejectWithValue }) => {
  try {
    const response = await userApi.getAllUsers()
    return response.users
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch users'
    return rejectWithValue(message)
  }
})
