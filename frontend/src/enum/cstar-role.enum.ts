/**
 * CSTAR tenant roles.
 *
 * Roles a user can hold within a CSTAR tenant. They are defined in the CSTAR
 * system and returned per-tenant by the backend (GET
 * /api/v1/frontend/auth/tenants/:tenantId/roles). The values must stay in sync
 * with the backend enum (`backend/src/enum/cstar-role.enum.ts`).
 *
 * Use these instead of hard-coding the role strings throughout the app.
 */
export enum CstarRole {
  NOTIFY_VIEWER = 'NOTIFY_VIEWER',
  NOTIFY_TEMPLATE_EDITOR = 'NOTIFY_TEMPLATE_EDITOR',
  NOTIFY_OPERATIONS_ADMIN = 'NOTIFY_OPERATIONS_ADMIN',
}
