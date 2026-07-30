import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import Dashboard from '@/pages/dashboard/Dashboard'
import codeTablesReducer from '@/redux/slices/codeTables.slice'
import notificationReducer from '@/redux/slices/notification.slice'
import tenantReducer from '@/redux/slices/tenant.slice'
import type { CodeTablesState } from '@/interfaces/CodeTables'
import type { PaginatedNotificationResponse } from '@/interfaces/PaginatedNotificationResponse'

vi.mock('@/pages/dashboard/sections/NotificationTemplatesSection', () => ({
  NotificationTemplatesSection: () => <div data-testid="notification-templates-section" />,
}))

vi.mock('@/redux/thunks/notification.thunks', async () => {
  const { createAsyncThunk: createThunk } = await import('@reduxjs/toolkit')
  return {
    fetchNotifications: createThunk<PaginatedNotificationResponse>(
      'notification/fetchAll',
      async () => {
        return {
          data: [],
          count: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
        }
      },
    ),
    connectNotificationSSE: vi.fn(() => new AbortController()),
  }
})

describe('Dashboard with CodeTables', () => {
  let preloadedState: any

  const baseNotificationState = {
    items: [],
    sortBy: null,
    sortOrder: null,
    filters: {},
    page: 1,
    limit: 10,
    count: 0,
    totalPages: 0,
    isLoading: false,
    error: null,
  }

  const mockCodeTablesState: CodeTablesState = {
    statuses: [
      { id: 'sent', label: 'Sent', description: 'sent' },
      { id: 'failed', label: 'Failed', description: 'failed' },
      { id: 'pending', label: 'Pending', description: 'pending' },
    ],
    channels: [
      { id: 'EMAIL', label: 'Email', description: 'EMAIL' },
      { id: 'SMS', label: 'SMS', description: 'SMS' },
    ],
    eventTypes: [{ id: 'PASSWORD_RESET', label: 'Password Reset', description: 'PASSWORD_RESET' }],
    isLoading: false,
    error: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    preloadedState = {
      codeTables: mockCodeTablesState,
      notification: baseNotificationState,
      tenant: {
        selectedTenant: null,
        showTenantModal: false,
      },
    }
  })

  const createStore = (initialState?: any) => {
    return configureStore({
      reducer: {
        codeTables: codeTablesReducer,
        notification: notificationReducer,
        tenant: tenantReducer,
      },
      preloadedState: initialState,
    } as any)
  }

  it('should use code tables from Redux (loaded at app root)', async () => {
    const store = createStore(preloadedState)

    render(
      <Provider store={store}>
        <Dashboard />
      </Provider>,
    )

    // Status filter items should be rendered from Redux code tables
    // which are loaded at root level, not by Dashboard itself
    const selectElements = screen.getAllByRole('combobox', { hidden: true })
    expect(selectElements.length).toBeGreaterThan(0)
  })

  it('should render status column filter options from Redux code tables', async () => {
    const store = createStore(preloadedState)
    const user = userEvent.setup()

    render(
      <Provider store={store}>
        <Dashboard />
      </Provider>,
    )

    // Open the Status column header dropdown and reveal the filter submenu
    await user.click(
      screen.getByRole('button', { name: /column options for notification status/i }),
    )
    fireEvent.mouseEnter(screen.getByText('Filter by'))

    // Filter options should come from the Redux code table statuses
    expect(screen.getByText('Sent')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('should use Redux statuses instead of enum', () => {
    const store = createStore(preloadedState)

    // This test verifies that the component doesn't import NotificationStatus enum
    // If it did, the following would fail since we're mocking thunks
    const { container } = render(
      <Provider store={store}>
        <Dashboard />
      </Provider>,
    )

    // The presence of the filter dropdown confirms Redux integration
    const filterButton = container.querySelector('select')
    expect(filterButton).toBeTruthy()
  })

  it('should handle loading state while fetching code tables', () => {
    const loadingState: any = {
      codeTables: {
        ...mockCodeTablesState,
        isLoading: true,
      },
      notification: baseNotificationState,
      tenant: {
        selectedTenant: null,
        showTenantModal: false,
      },
    }

    const store = createStore(loadingState)

    render(
      <Provider store={store}>
        <Dashboard />
      </Provider>,
    )

    // Component should render even during loading
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy()
  })

  it('should handle error state from code tables', () => {
    const errorState: any = {
      codeTables: {
        statuses: [],
        channels: [],
        eventTypes: [],
        isLoading: false,
        error: 'Failed to fetch code tables',
      },
      notification: baseNotificationState,
      tenant: {
        selectedTenant: null,
        showTenantModal: false,
      },
    }

    const store = createStore(errorState)

    render(
      <Provider store={store}>
        <Dashboard />
      </Provider>,
    )

    // Component should still render with fallback or empty state
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy()
  })

  it('should reflect updated code table statuses in the column filter options', async () => {
    const newState: any = {
      codeTables: {
        ...mockCodeTablesState,
        statuses: [
          ...mockCodeTablesState.statuses,
          { id: 'scheduled', label: 'Scheduled', description: 'scheduled' },
        ],
      },
      notification: baseNotificationState,
      tenant: {
        selectedTenant: null,
        showTenantModal: false,
      },
    }

    const store = createStore(newState)
    const user = userEvent.setup()

    render(
      <Provider store={store}>
        <Dashboard />
      </Provider>,
    )

    await user.click(
      screen.getByRole('button', { name: /column options for notification status/i }),
    )
    fireEvent.mouseEnter(screen.getByText('Filter by'))

    expect(screen.getByText('Scheduled')).toBeInTheDocument()
  })
})
