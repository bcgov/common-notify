/**
 * Authenticated user data extracted from JWT token
 * This represents the current logged-in user's info from Keycloak
 */
export interface AuthUser {
  // Core user identifiers
  id: string
  email: string
  username: string
  displayName: string

  // Name components
  givenName?: string
  familyName?: string

  // IDIR-specific claims
  idirUserGuid?: string
  idirUsername?: string
  userPrincipalName?: string

  // Authentication metadata
  identityProvider?: string
  scope?: string
  tokenType?: string
  sessionState?: string
}
