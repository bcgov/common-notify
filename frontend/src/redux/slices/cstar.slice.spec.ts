import { describe, it, expect } from 'vitest'
import cstarReducer from './cstar.slice'
import { fetchCstarTenants } from '../thunks/cstar.thunks'

describe('cstar.slice - hasLoaded', () => {
  const initial = cstarReducer(undefined, { type: '@@INIT' })

  it('starts false so consumers can tell "not asked yet" from "asked, no tenants"', () => {
    expect(initial.hasLoaded).toBe(false)
    expect(initial.tenants).toEqual([])
    expect(initial.isLoading).toBe(false)
  })

  it('stays false while the request is pending', () => {
    const state = cstarReducer(initial, fetchCstarTenants.pending('req', undefined))

    expect(state.isLoading).toBe(true)
    expect(state.hasLoaded).toBe(false)
  })

  it('is set once tenants come back', () => {
    const tenants = [{ id: 'tenant-1', name: 'Tenant One' }] as any
    const state = cstarReducer(initial, fetchCstarTenants.fulfilled(tenants, 'req', undefined))

    expect(state.hasLoaded).toBe(true)
    expect(state.tenants).toEqual(tenants)
  })

  it('is set when the request fails, so the check still runs', () => {
    const state = cstarReducer(
      initial,
      fetchCstarTenants.rejected(null, 'req', undefined, 'CSTAR unavailable'),
    )

    expect(state.hasLoaded).toBe(true)
    expect(state.error).toBe('CSTAR unavailable')
  })
})
