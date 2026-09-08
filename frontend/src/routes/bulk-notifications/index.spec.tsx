import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import userReducer from '@/redux/slices/user.slice'
import tenantReducer from '@/redux/slices/tenant.slice'
import featureFlagsReducer from '@/redux/slices/featureFlags.slice'
import loadingReducer from '@/redux/slices/loading.slice'
import { CstarRole } from '@/enum/cstar-role.enum'
import { Route } from './index'

// `createFileRoute` returns the options object so the component can be rendered on its own,
// the same shape `__root.spec.tsx` uses.
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}))

vi.mock('@/pages/bulk-notifications/BulkNotifications', () => ({
  default: () => <div>Bulk Notifications page</div>,
}))

const getMock = vi.fn(() => new Promise(() => {}))
vi.mock('@/common/api', () => ({
  get: (...args: unknown[]) => getMock(...args),
}))

const TENANT_ID = 'tenant-1'

function renderRoute({
  roles = [CstarRole.NOTIFY_TEMPLATE_EDITOR],
  bulkEnabled = true,
  rolesTenantId = TENANT_ID as string | null,
  // `null` stands for "no flags loaded for a tenant yet"; an explicit `undefined` would
  // fall back to the default above.
  flagsTenantId = TENANT_ID as string | null,
  flagsSynced = true,
} = {}) {
  const store = configureStore({
    reducer: {
      user: userReducer,
      tenant: tenantReducer,
      featureFlags: featureFlagsReducer,
      loading: loadingReducer,
    },
    preloadedState: {
      user: {
        current: { cstarRoles: roles } as never,
        isLoading: false,
        rolesLoading: false,
        rolesTenantId,
        error: null,
        rolesError: null,
      },
      tenant: {
        selectedTenant: { id: TENANT_ID, name: 'Test Tenant' } as never,
        showTenantModal: false,
      },
      featureFlags: {
        byCode: { bulk_notifications: bulkEnabled },
        flagsList: [],
        loading: false,
        synced: flagsSynced,
        tenantId: flagsTenantId ?? undefined,
      },
    },
  })

  const RouteComponent = (Route as unknown as { component: () => ReactNode }).component

  return render(
    <Provider store={store}>
      <RouteComponent />
    </Provider>,
  )
}

describe('/bulk-notifications route', () => {
  it('renders the page for a user with a tenant role while the flag is on', () => {
    renderRoute()

    expect(screen.getByText('Bulk Notifications page')).toBeInTheDocument()
  })

  it('renders 404 when the feature flag is off', () => {
    renderRoute({ bulkEnabled: false })

    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.queryByText('Bulk Notifications page')).not.toBeInTheDocument()
  })

  it('renders 404 when the user holds no role in the selected tenant', () => {
    renderRoute({ roles: [] })

    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.queryByText('Bulk Notifications page')).not.toBeInTheDocument()
  })

  it('waits rather than flashing 404 while the tenant roles are still in flight', () => {
    renderRoute({ rolesTenantId: null })

    expect(screen.queryByText('404')).not.toBeInTheDocument()
    expect(screen.queryByText('Bulk Notifications page')).not.toBeInTheDocument()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('waits rather than flashing 404 while the tenant flags are still in flight', () => {
    renderRoute({ flagsTenantId: null })

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('falls back to 404 when the flag lookup fails, instead of waiting forever', async () => {
    getMock.mockRejectedValueOnce(new Error('flag service down'))
    // Nothing loaded yet, so the hook fetches and the rejection above is what settles it.
    renderRoute({ flagsTenantId: null, flagsSynced: false, bulkEnabled: false })

    expect(await screen.findByText('404')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())
  })
})
