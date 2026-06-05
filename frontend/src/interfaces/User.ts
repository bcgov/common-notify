/**
 * User response from backend
 * Represents the internal notify_user record after creation/update
 */
export interface UserResponse {
  id: string
  externalId: string
  email: string
  username: string
  displayName: string
  givenName?: string
  familyName?: string
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
  isDeleted: boolean
  /** User's roles in the selected tenant from CSTAR */
  cstarRoles?: string[]
}

/**
 * Response from upsert user endpoint
 * Contains the upserted user record and a flag indicating if it was newly created
 */
export interface UpsertUserResponse {
  user: UserResponse
  isNew: boolean
  message: string
}

/**
 * Response from get all users endpoint
 */
export interface GetAllUsersResponse {
  users: UserResponse[]
  count: number
}
