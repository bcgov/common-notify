import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import userReducer from '@/redux/slices/user.slice'
import tenantReducer, { selectTenant } from '@/redux/slices/tenant.slice'
import cstarReducer from '@/redux/slices/cstar.slice'
import loadingReducer from '@/redux/slices/loading.slice'
import { CstarRole } from '@/enum/cstar-role.enum'
import Layout from './Layout'

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/' }),
  useNavigate: () => vi.fn(),
}))

// Roles are left in flight so the "roles pending" case stays pending.
vi.mock('@/api/cstar.api', () => ({
  default: {
    fetchUserTenants: vi.fn(() => new Promise(() => {})),
    fetchUserRoles: vi.fn(() => new Promise(() => {})),
  },
}))

vi.mock('@/service/user-service', () => ({
  default: { hasRole: vi.fn(() => false) },
}))

vi.mock('./Sidebar', () => ({ default: () => <nav /> }))
vi.mock('./TenantSwitcher', () => ({ default: () => <div /> }))
vi.mock('./TenantSelectionModal', () => ({ default: () => null }))
vi.mock('./TenantError', () => ({ default: () => <div>Tenant error</div> }))

const TENANT = { id: 'tenant-1', name: 'Test Tenant' }

function renderLayout({
  selectedTenant = TENANT as typeof TENANT | null,
  rolesTenantId = TENANT.id as string | null,
  tenants = [TENANT],
  globalLoading = false,
} = {}) {
  const store = configureStore({
    reducer: {
      user: userReducer,
      tenant: tenantReducer,
      cstar: cstarReducer,
      loading: loadingReducer,
    },
    preloadedState: {
      user: {
        current: { cstarRoles: [CstarRole.NOTIFY_TEMPLATE_EDITOR] } as never,
        isLoading: false,
        rolesLoading: false,
        rolesTenantId,
        error: null,
        rolesError: null,
      },
      tenant: { selectedTenant: selectedTenant as never, showTenantModal: false },
      cstar: { tenants: tenants as never, isLoading: false, hasLoaded: true, error: null },
      loading: { isLoading: globalLoading, requestCount: globalLoading ? 1 : 0 },
    },
  })

  return {
    store,
    ...render(
      <Provider store={store}>
        <Layout>
          <div>Page content</div>
        </Layout>
      </Provider>,
    ),
  }
}

const queryLoading = () => screen.queryByRole('progressbar', { name: 'Loading...' })

describe('Layout loading indicators', () => {
  it('shows the loading indicator instead of the page while roles for the tenant are pending', () => {
    renderLayout({ rolesTenantId: null })

    expect(queryLoading()).toBeInTheDocument()
    expect(screen.queryByText('Page content')).not.toBeInTheDocument()
  })

  it('shows the loading indicator instead of the page while a tenant is being selected', () => {
    renderLayout({ selectedTenant: null, rolesTenantId: null })

    expect(queryLoading()).toBeInTheDocument()
    expect(screen.queryByText('Page content')).not.toBeInTheDocument()
  })

  it('renders the page with no loading indicator once everything has settled', () => {
    const { container } = renderLayout()

    expect(screen.getByText('Page content')).toBeInTheDocument()
    expect(queryLoading()).not.toBeInTheDocument()
    expect(container.querySelector('.page-loading--overlay')).not.toBeInTheDocument()
  })

  it('shows the overlay on top of the page while a slow API request is in flight', () => {
    const { container } = renderLayout({ globalLoading: true })

    expect(screen.getByText('Page content')).toBeInTheDocument()
    expect(queryLoading()).toBeInTheDocument()
    expect(container.querySelector('.page-loading--overlay .page-loading__card')).toContainElement(
      queryLoading(),
    )
  })
})

describe('Layout tenant switching', () => {
  // Pages keep tenant data in local state (e.g. one-shot api/ calls) and rely on this to drop it.
  it('unmounts the page while the new tenant loads its roles', () => {
    const { store } = renderLayout()
    expect(screen.getByText('Page content')).toBeInTheDocument()

    act(() => {
      store.dispatch(selectTenant({ id: 'tenant-2', name: 'Other Tenant' } as never))
    })

    expect(screen.queryByText('Page content')).not.toBeInTheDocument()
    expect(queryLoading()).toBeInTheDocument()
  })
})
