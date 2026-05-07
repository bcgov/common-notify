import { describe, expect, it } from 'vitest'
import tenantReducer, { selectTenant } from './tenant.slice'
import { fetchCstarTenants } from '../thunks/cstar.thunks'
import type { Tenant } from '@/interfaces/CstarTenant'

const buildTenant = (id: string, name: string): Tenant => ({
  id,
  name,
  ministryName: `${name} Ministry`,
  description: `${name} description`,
  createdDateTime: '2026-01-01T00:00:00.000Z',
  updatedDateTime: '2026-01-01T00:00:00.000Z',
  createdBy: 'tester',
  updatedBy: 'tester',
  users: [],
})

describe('tenant slice', () => {
  it('auto-selects when CSTAR returns one tenant', () => {
    const tenant = buildTenant('tenant-1', 'Tenant One')
    const state = tenantReducer(
      undefined,
      fetchCstarTenants.fulfilled([tenant], 'request-id', 'user-1'),
    )

    expect(state.selectedTenant).toEqual(tenant)
    expect(state.showTenantModal).toBe(false)
  })

  it('shows the modal when CSTAR returns multiple tenants and nothing is selected', () => {
    const state = tenantReducer(
      undefined,
      fetchCstarTenants.fulfilled(
        [buildTenant('tenant-1', 'Tenant One'), buildTenant('tenant-2', 'Tenant Two')],
        'request-id',
        'user-1',
      ),
    )

    expect(state.selectedTenant).toBeNull()
    expect(state.showTenantModal).toBe(true)
  })

  it('clears the selection when CSTAR returns no tenants', () => {
    const selectedState = tenantReducer(
      undefined,
      selectTenant(buildTenant('tenant-1', 'Tenant One')),
    )
    const state = tenantReducer(
      selectedState,
      fetchCstarTenants.fulfilled([], 'request-id', 'user-1'),
    )

    expect(state.selectedTenant).toBeNull()
    expect(state.showTenantModal).toBe(false)
  })

  it('clears the selection when CSTAR fails', () => {
    const selectedState = tenantReducer(
      undefined,
      selectTenant(buildTenant('tenant-1', 'Tenant One')),
    )
    const state = tenantReducer(
      selectedState,
      fetchCstarTenants.rejected(new Error('boom'), 'request-id', 'user-1', 'Failed to fetch'),
    )

    expect(state.selectedTenant).toBeNull()
    expect(state.showTenantModal).toBe(false)
  })
})
