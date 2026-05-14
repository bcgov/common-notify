import { describe, expect, it, beforeEach, vi } from 'vitest'
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
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
    vi.clearAllMocks()
  })
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

  it('preserves selected tenant when CSTAR fails (do not break existing selection)', () => {
    const tenant = buildTenant('tenant-1', 'Tenant One')
    const selectedState = tenantReducer(undefined, selectTenant(tenant))
    const state = tenantReducer(
      selectedState,
      fetchCstarTenants.rejected(new Error('boom'), 'request-id', 'user-1', 'Failed to fetch'),
    )

    // Should keep the selected tenant even if CSTAR fails
    expect(state.selectedTenant).toEqual(tenant)
    expect(state.showTenantModal).toBe(false)
  })
})
