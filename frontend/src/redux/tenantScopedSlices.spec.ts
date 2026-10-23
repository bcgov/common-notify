import { describe, expect, it } from 'vitest'
import type { Tenant } from '@/interfaces/CstarTenant'
import { reducers } from './store'
import { selectTenant } from './slices/tenant.slice'

/**
 * Slices holding data for the selected tenant. tenantGuardMiddleware drops results that land
 * after a tenant switch, so these must reset on `selectTenant`: otherwise the previous tenant's
 * data stays on screen, and any loading or saving flag a dropped result would have cleared
 * stays set.
 */
const TENANT_SCOPED = [
  'notification',
  'notificationDetail',
  'templates',
  'events',
  'safelist',
  'apiKeys',
  'apiKeyUsage',
  'tenantSettings',
  'emailSettings',
  'smsSettings',
  'featureFlags',
] as const

/** Session, global or cross-tenant state that a tenant switch does not invalidate. */
const NOT_TENANT_SCOPED = [
  'auth',
  'user',
  'users',
  'cstar',
  'loading',
  'toast',
  'codeTables',
  'tenant',
  'adminTenants',
] as const

const tenant = { id: 'tenant-b', name: 'Tenant B' } as Tenant

describe('tenant-scoped slices', () => {
  it('classifies every slice in the store', () => {
    const classified = [...TENANT_SCOPED, ...NOT_TENANT_SCOPED]
    expect(new Set(classified).size).toBe(classified.length)
    expect([...classified].sort()).toEqual(Object.keys(reducers).sort())
  })

  it.each(TENANT_SCOPED)('%s resets on selectTenant', (name) => {
    const reducer = reducers[name] as (state: unknown, action: unknown) => unknown
    const initial = reducer(undefined, { type: '@@init' }) as Record<string, unknown>
    // Every field holds a value no reset would produce, so an unhandled action returns this
    // exact object and a handled one returns a new one.
    const dirty = Object.fromEntries(Object.keys(initial).map((key) => [key, '__dirty__']))

    expect(reducer(dirty, selectTenant(tenant))).not.toBe(dirty)
  })
})
