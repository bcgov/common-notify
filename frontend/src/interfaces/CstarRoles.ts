/**
 * Individual role object from CSTAR API
 */
export interface CstarRole {
  id: string
  name: string
  description: string
  allowedIdentityProviders?: string[]
  groups?: Array<{ id: string; name: string }>
  createdDateTime?: string
  updatedDateTime?: string
  createdBy?: string | null
  updatedBy?: string | null
}

/**
 * Response from CSTAR API for user roles in a tenant
 */
export interface CstarRolesResponse {
  data: {
    sharedServiceRoles: CstarRole[]
  }
}

/**
 * Response from backend proxy endpoint for user roles
 * Backend returns simple array of role name strings
 */
export interface BackendRolesResponse {
  data: {
    roles: string[]
  }
}
