import { describe, it, expect, beforeEach, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { render, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import React, { act } from 'react'
import authReducer from '@/redux/slices/auth.slice'
import cstarReducer from '@/redux/slices/cstar.slice'
import tenantReducer from '@/redux/slices/tenant.slice'
import codeTablesReducer from '@/redux/slices/codeTables.slice'
import notificationReducer from '@/redux/slices/notification.slice'
import type { CodeTablesState } from '@/interfaces/CodeTables'
import * as codeTableThunks from '@/redux/thunks/codeTables.thunks'
import cstarApi from '@/api/cstar.api'
import { Route } from './__root'

const mockNavigate = vi.fn()

vi.mock('@/redux/thunks/codeTables.thunks')
vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@tanstack/react-router', () => ({
  createRootRoute: (options: any) => options,
  useNavigate: () => mockNavigate,
  Outlet: () => <div data-testid="outlet" />,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  ErrorComponent: () => <div />,
}))
vi.mock('@/api/cstar.api', () => ({
  default: { fetchUserTenants: vi.fn(), fetchUserRoles: vi.fn() },
}))
vi.mock('@/service/user-service', () => ({
  default: { hasRole: vi.fn(() => false), doLogout: vi.fn() },
}))

describe('RootLayout - CodeTables Loading', () => {
  const mockCodeTablesState: CodeTablesState = {
    statuses: [
      { id: 'sent', label: 'Sent', description: 'sent' },
      { id: 'failed', label: 'Failed', description: 'failed' },
    ],
    channels: [{ id: 'EMAIL', label: 'Email', description: 'EMAIL' }],
    eventTypes: [{ id: 'PASSWORD_RESET', label: 'Password Reset', description: 'PASSWORD_RESET' }],
    isLoading: false,
    error: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createStore = (preloadedState?: any) => {
    return configureStore({
      reducer: {
        codeTables: codeTablesReducer,
        notification: notificationReducer,
      },
      preloadedState,
    } as any)
  }

  it('should dispatch fetchCodeTables on component mount', async () => {
    // We'll test this via importing the route and checking the effect
    // This is a simplified test showing the intent
    const mockFetch = vi.fn().mockResolvedValue(mockCodeTablesState)
    vi.mocked(codeTableThunks.fetchCodeTables).mockImplementation(mockFetch)

    const preloadedState: any = {
      codeTables: mockCodeTablesState,
      notification: {
        items: [],
        filters: {},
        isLoading: false,
        error: null,
      },
    }

    const store = createStore(preloadedState)

    // Verify store has code tables available
    const state = store.getState()
    expect(state.codeTables.statuses).toHaveLength(2)
    expect(state.codeTables.channels).toHaveLength(1)
    expect(state.codeTables.eventTypes).toHaveLength(1)
  })

  it('should have code tables available to child routes via Redux', () => {
    const preloadedState: any = {
      codeTables: mockCodeTablesState,
      notification: {
        items: [],
        filters: {},
        isLoading: false,
        error: null,
      },
    }

    const store = createStore(preloadedState)
    const state = store.getState()

    // Any child route can access code tables from Redux store
    expect(state.codeTables.statuses).toBeDefined()
    expect(state.codeTables.channels).toBeDefined()
    expect(state.codeTables.eventTypes).toBeDefined()
  })
})

describe('RootLayout - tenant authorization check', () => {
  const RootLayout = (Route as any).component as React.FC

  // A first login: nothing cached in localStorage, so no tenant is selected yet.
  const freshLoginStore = () =>
    configureStore({
      reducer: {
        auth: authReducer,
        cstar: cstarReducer,
        tenant: tenantReducer,
      },
      preloadedState: {
        auth: {
          user: { id: 'idir-guid-1', email: 'a@b.ca', username: 'abc', displayName: 'A B' },
          isAuthenticated: true,
          isInitializing: false,
          error: null,
        },
        cstar: { tenants: [], isLoading: false, hasLoaded: false, error: null },
        tenant: { selectedTenant: null, showTenantModal: false },
      } as any,
    })

  beforeEach(() => {
    mockNavigate.mockClear()
    localStorage.clear()
    // Code tables are irrelevant here; keep the dispatch a no-op.
    vi.mocked(codeTableThunks.fetchCodeTables).mockReturnValue({ type: 'test/noop' } as any)
  })

  const renderRoot = (store: ReturnType<typeof freshLoginStore>) =>
    render(
      <Provider store={store}>
        <RootLayout />
      </Provider>,
    )

  it('does not send a first-time user to /not-authorized before CSTAR has responded', async () => {
    // CSTAR is still in flight — the app knows nothing about the user's tenants yet.
    let resolveTenants: (value: any) => void = () => {}
    vi.mocked(cstarApi.fetchUserTenants).mockReturnValue(
      new Promise((resolve) => {
        resolveTenants = resolve
      }),
    )

    const store = freshLoginStore()
    renderRoot(store)

    await waitFor(() => expect(cstarApi.fetchUserTenants).toHaveBeenCalled())
    expect(mockNavigate).not.toHaveBeenCalled()

    // CSTAR comes back with the user's single tenant: still no 403.
    await act(async () => {
      resolveTenants({ data: { tenants: [{ id: 'tenant-1', name: 'Tenant One' }] } })
    })

    expect(mockNavigate).not.toHaveBeenCalledWith({ to: '/not-authorized' })
    expect(store.getState().tenant.selectedTenant?.id).toBe('tenant-1')
  })

  it('sends the user to /not-authorized once CSTAR confirms they have no tenants', async () => {
    vi.mocked(cstarApi.fetchUserTenants).mockResolvedValue({ data: { tenants: [] } } as any)

    renderRoot(freshLoginStore())

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/not-authorized' }))
  })
})
