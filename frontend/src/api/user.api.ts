import type { AxiosError } from 'axios'
import { post, get, generateApiParameters } from '@/common/api'
import { getApiResponseMessage } from '@/utils/apiErrorMessage'
import type { AuthUser } from '@/interfaces/AuthUser'
import type { UpsertUserResponse, GetAllUsersResponse } from '@/interfaces/User'

/**
 * User API for managing user records
 * Endpoints for upserting current user and retrieving all users
 */
export const userApi = {
  /**
   * Upsert current user record
   * Called on login or profile refresh to sync user info from JWT claims
   *
   * POST /api/v1/frontend/users/me
   *
   * @param authUser Current authenticated user from JWT
   * @returns UpsertUserResponse with the user record and isNew flag
   */
  async upsertCurrentUser(authUser: AuthUser) {
    try {
      // Filter AuthUser to only include fields that UpsertUserDto expects
      const dtoPayload = {
        id: authUser.id,
        email: authUser.email,
        displayName: authUser.displayName,
        username: authUser.username,
        givenName: authUser.givenName,
        familyName: authUser.familyName,
      }

      const params = generateApiParameters('/api/v1/frontend/users/me')
      return await post<UpsertUserResponse>({
        ...params,
        data: dtoPayload,
      })
    } catch (error) {
      const validationErrors = getApiResponseMessage(error) || ''
      // ValidationExceptionFilter sends a field's single error as a string, several as an array.
      const fieldErrors =
        (error as AxiosError<{ fieldErrors?: Record<string, string | string[]> }>)?.response?.data
          ?.fieldErrors || {}

      // Extract specific field errors for display
      const fieldErrorMessages = Object.entries(fieldErrors)
        .map(([field, errors]) => `${field}: ${[errors].flat().join(', ')}`)
        .join('\n')

      throw new Error(`Failed to upsert user:\n${fieldErrorMessages || validationErrors}`)
    }
  },

  /**
   * Get all users
   * Returns a list of all non-deleted users in the system
   *
   * GET /api/v1/frontend/users
   *
   * @returns GetAllUsersResponse with array of users
   */
  async getAllUsers() {
    try {
      const params = generateApiParameters('/api/v1/frontend/users')
      return await get<GetAllUsersResponse>(params)
    } catch (error) {
      throw new Error(
        `Failed to fetch users: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  },
}

export default userApi
