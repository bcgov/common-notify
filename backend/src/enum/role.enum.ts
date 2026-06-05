/**
 * SSO Roles
 * Roles defined in Keycloak for authorization in the Notify system
 */
export enum SsoRole {
  NOTIFY_ADMIN = 'NOTIFY_ADMIN',
  NOTIFY_USER = 'NOTIFY_USER',
}

/**
 * @deprecated Use SsoRole instead
 */
export type Role = SsoRole
