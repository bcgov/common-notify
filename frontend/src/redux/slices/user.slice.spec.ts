import { describe, it, expect } from 'vitest'
import userReducer from './user.slice'
import { fetchCstarRoles } from '../thunks/cstar.thunks'

describe('user.slice - rolesTenantId', () => {
  const withUser = {
    current: { id: 'u1', cstarRoles: ['NOTIFY_VIEWER'] } as any,
    isLoading: false,
    rolesLoading: false,
    rolesTenantId: 'tenant-a',
    error: null,
    rolesError: null,
  }

  it('is cleared while a lookup is in flight so stale roles are not trusted', () => {
    const state = userReducer(withUser, fetchCstarRoles.pending('req', { tenantId: 'tenant-b' }))

    expect(state.rolesLoading).toBe(true)
    expect(state.rolesTenantId).toBeNull()
  })

  it('records the tenant the loaded roles belong to', () => {
    const state = userReducer(
      withUser,
      fetchCstarRoles.fulfilled(['NOTIFY_OPERATIONS_ADMIN'], 'req', { tenantId: 'tenant-b' }),
    )

    expect(state.rolesTenantId).toBe('tenant-b')
    expect(state.current?.cstarRoles).toEqual(['NOTIFY_OPERATIONS_ADMIN'])
  })

  it('records the tenant on failure too, so the access check is not blocked forever', () => {
    const state = userReducer(
      withUser,
      fetchCstarRoles.rejected(null, 'req', { tenantId: 'tenant-b' }, 'boom'),
    )

    expect(state.rolesTenantId).toBe('tenant-b')
    expect(state.rolesError).toBe('boom')
  })
})
