import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import cstarApi from '@/api/cstar.api'
import type { Tenant } from '@/interfaces/CstarTenant'
import userReducer from '@/redux/slices/user.slice'
import tenantReducer from '@/redux/slices/tenant.slice'
import cstarReducer from '@/redux/slices/cstar.slice'
import { tenantGuardMiddleware } from '@/redux/middleware/tenantGuard'
import TenantSwitcher from './TenantSwitcher'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

vi.mock('@/api/cstar.api', () => ({
  default: { fetchUserTenants: vi.fn(), fetchUserRoles: vi.fn() },
}))

const tenantA = { id: 'tenant-a', name: 'Tenant A' } as Tenant
const tenantB = { id: 'tenant-b', name: 'Tenant B' } as Tenant
const tenantC = { id: 'tenant-c', name: 'Tenant C' } as Tenant

type RolesResponse = Awaited<ReturnType<typeof cstarApi.fetchUserRoles>>

/** A promise the test settles by hand, standing in for a slow roles lookup. */
function deferred() {
  let resolve!: (value: RolesResponse) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<RolesResponse>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function renderSwitcher() {
  const store = configureStore({
    reducer: { user: userReducer, tenant: tenantReducer, cstar: cstarReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(tenantGuardMiddleware),
    preloadedState: {
      tenant: { selectedTenant: tenantA, showTenantModal: false },
      cstar: {
        tenants: [tenantA, tenantB, tenantC],
        isLoading: false,
        hasLoaded: true,
        error: null,
      },
    },
  })
  render(
    <Provider store={store}>
      <TenantSwitcher />
    </Provider>,
  )
  return store
}

async function switchTo(tenant: Tenant) {
  await userEvent.click(screen.getByRole('button', { name: /Tenant/ }))
  await userEvent.click(await screen.findByRole('option', { name: tenant.name }))
}

describe('TenantSwitcher', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
  })

  it('goes to the dashboard when the user has roles in the new tenant', async () => {
    vi.mocked(cstarApi.fetchUserRoles).mockResolvedValue({ data: { roles: ['viewer'] } } as never)
    renderSwitcher()

    await switchTo(tenantB)

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/dashboard' }))
  })

  it('goes to not-authorized when the user has no roles in the new tenant', async () => {
    vi.mocked(cstarApi.fetchUserRoles).mockResolvedValue({ data: { roles: [] } } as never)
    renderSwitcher()

    await switchTo(tenantB)

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/not-authorized' }))
  })

  it("does not redirect on a previous tenant's roles that fail after switching again", async () => {
    const rolesB = deferred()
    const rolesC = deferred()
    vi.mocked(cstarApi.fetchUserRoles).mockImplementation(
      (tenantId: string) => (tenantId === tenantB.id ? rolesB.promise : rolesC.promise) as never,
    )
    const store = renderSwitcher()

    await switchTo(tenantB)
    await switchTo(tenantC)
    rolesC.resolve({ data: { roles: ['viewer'] } } as never)
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/dashboard' }))

    rolesB.reject(new Error('CSTAR unavailable'))
    await waitFor(() => expect(cstarApi.fetchUserRoles).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(navigate).not.toHaveBeenCalledWith({ to: '/not-authorized' })
    expect(store.getState().user.rolesTenantId).toBe(tenantC.id)
    expect(store.getState().user.rolesError).toBeNull()
  })
})
