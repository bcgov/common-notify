/**
 * SSO client roles.
 *
 * These are application-wide roles carried on the JWT (`client_roles`), as
 * opposed to {@link CstarRole}, which are scoped to the selected CSTAR tenant.
 * Read them via `UserService.hasRole(...)`. The values must stay in sync with
 * the backend enum (`backend/src/enum/sso-role.enum.ts`).
 */
export enum SsoRole {
  NOTIFY_ADMIN = 'NOTIFY_ADMIN',
}
