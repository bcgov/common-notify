import { createAsyncThunk } from '@reduxjs/toolkit'
import UserService from '@/service/user-service'
import type { AuthUser } from '@/interfaces/AuthUser'
import type { RootState } from '../store'

/**
 * Initialize auth from JWT token
 *
 * This thunk extracts user data from the JWT token provided by Keycloak.
 * It's called on app initialization to populate Redux with the logged-in user's info.
 * All user data comes from the JWT token, not from separate API calls.
 */
export const initializeAuthFromToken = createAsyncThunk<
  AuthUser | null,
  void,
  {
    state: RootState
    rejectValue: string
    dispatch: any
  }
>('auth/initializeAuthFromToken', async (_, { rejectWithValue }) => {
  try {
    // Check if user is logged in
    if (!UserService.isLoggedIn()) {
      return null
    }

    // Extract JWT token and parsed claims from Keycloak
    const tokenParsed = UserService.getTokenParsed()

    if (!tokenParsed) {
      return null
    }

    // Map JWT claims to AuthUser interface
    const user: AuthUser = {
      // Core identifiers
      id: tokenParsed.sub || tokenParsed.preferred_username || 'unknown',
      email: tokenParsed.email || '',
      displayName: tokenParsed.display_name || tokenParsed.name || '',
      username: tokenParsed.preferred_username || '',

      // Name components
      givenName: tokenParsed.given_name,
      familyName: tokenParsed.family_name,

      // IDIR-specific claims
      idirUserGuid: tokenParsed.idir_user_guid,
      idirUsername: tokenParsed.idir_username,
      userPrincipalName: tokenParsed.user_principal_name,

      // Authentication metadata
      identityProvider: tokenParsed.identity_provider,
      scope: tokenParsed.scope,
      tokenType: tokenParsed.token_type,
      sessionState: tokenParsed.session_state,
    }

    return user
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Failed to initialize auth')
  }
})
