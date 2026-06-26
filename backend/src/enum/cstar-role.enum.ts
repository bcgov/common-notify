/**
 * CSTAR Roles
 * Roles that users can have in CSTAR for authorization in the Notify system
 * These roles are defined in the CSTAR system and returned via the shared-service-roles endpoint
 */
export enum CstarRole {
  NOTIFY_VIEWER = 'NOTIFY_VIEWER',
  NOTIFY_TEMPLATE_EDITOR = 'NOTIFY_TEMPLATE_EDITOR',
  NOTIFY_OPERATIONS_ADMIN = 'NOTIFY_OPERATIONS_ADMIN',
}
