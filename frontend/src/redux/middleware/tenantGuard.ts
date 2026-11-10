import { isAsyncThunkAction } from '@reduxjs/toolkit'
import type { Middleware } from '@reduxjs/toolkit'
import type { Tenant } from '@/interfaces/CstarTenant'

// Only the slice the guard reads; typing against RootState would make the store's type circular.
interface TenantGuardState {
  tenant: { selectedTenant: Tenant | null }
}

/**
 * Thunks whose results don't belong to the selected tenant, so a tenant switch never
 * invalidates them. Entries are thunk type prefixes; `slice/*` covers every thunk in a slice.
 */
export const TENANT_AGNOSTIC_THUNKS: readonly string[] = [
  'auth/*',
  'user/*',
  // Not `cstar/*`: roles are per tenant, and are always dispatched after `selectTenant`.
  'cstar/fetchTenants',
  'codeTables/*',
  'adminTenants/*',
  'apiKeyUsage/fetchAllTenants',
  'apiKeyUsage/updateTenantLimits',
  'featureFlags/fetchAll',
  'featureFlags/create',
  'featureFlags/update',
  'featureFlags/delete',
]

const isTenantAgnostic = (typePrefix: string): boolean =>
  TENANT_AGNOSTIC_THUNKS.some((entry) =>
    entry.endsWith('/*') ? typePrefix.startsWith(entry.slice(0, -1)) : typePrefix === entry,
  )

/**
 * Drops thunk results that belong to a tenant that is no longer selected.
 *
 * If a request starts for tenant A and the user switches to tenant B before it finishes, its
 * fulfilled/rejected action is not passed to the reducers. Tenant-agnostic thunks pass through untouched.
 *
 * Because a dropped result never clears the loading or saving flag its `pending` set, every
 * tenant-scoped slice must also reset on `selectTenant` (enforced by tenantScopedSlices.spec.ts).
 */
export const tenantGuardMiddleware: Middleware<object, TenantGuardState> = (api) => {
  const tenantByRequestId = new Map<string, string | null>()

  return (next) => (action) => {
    if (!isAsyncThunkAction(action)) return next(action)

    const typePrefix = action.type.slice(0, action.type.lastIndexOf('/'))
    if (isTenantAgnostic(typePrefix)) return next(action)

    const { requestId, requestStatus } = action.meta
    const currentTenantId = api.getState().tenant.selectedTenant?.id ?? null

    if (requestStatus === 'pending') {
      tenantByRequestId.set(requestId, currentTenantId)
      return next(action)
    }

    const requestTenantId = tenantByRequestId.get(requestId)
    tenantByRequestId.delete(requestId)
    if (requestTenantId !== undefined && requestTenantId !== currentTenantId) return action

    return next(action)
  }
}
