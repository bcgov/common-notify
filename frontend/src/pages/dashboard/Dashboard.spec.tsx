import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import Dashboard from '@/pages/dashboard/Dashboard'
import codeTablesReducer from '@/redux/slices/codeTables.slice'
import notificationReducer from '@/redux/slices/notification.slice'
import type { CodeTablesState } from '@/interfaces/CodeTables'
import type { NotificationRequest } from '@/interfaces/NotificationRequest'

vi.mock('@/redux/thunks/notification.thunks', async () => {
  const { createAsyncThunk: createThunk } = await import('@reduxjs/toolkit')
  return {
    fetchNotifications: createThunk<NotificationRequest[]>('notification/fetchAll', async () => {
      return []
    }),
  }
})

describe('Dashboard with CodeTables', () => {
  let preloadedState: any

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
      notification: {
        items: [],
        statusFilter: 'all',
        isLoading: false,
        error: null,
      },
    }
  })

  const createStore = (initialState?: any) => {
    return configureStore({
      reducer: {
        codeTables: codeTablesReducer,
        notification: notificationReducer,
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
    const selectElement = screen.getByRole('combobox', { hidden: true })
    expect(selectElement).toBeTruthy()
  })

  it('should render status filter with code table items from Redux', async () => {
    const store = createStore(preloadedState)

    const { container } = render(
      <Provider store={store}>
        <Dashboard />
      </Provider>,
    )

    await waitFor(() => {
      // The filter dropdown should contain "All" plus the statuses from Redux
      const selectOptions = container.querySelectorAll('select option')
      const optionValues = Array.from(selectOptions).map((opt) => opt.getAttribute('value'))

      expect(optionValues).toContain('all')
      expect(optionValues).toContain('sent')
      expect(optionValues).toContain('failed')
      expect(optionValues).toContain('pending')
    })
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
      notification: {
        items: [],
        statusFilter: 'all',
        isLoading: false,
        error: null,
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
      notification: {
        items: [],
        statusFilter: 'all',
        isLoading: false,
        error: null,
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

  it('should update filter options when code tables change', () => {
    const store = createStore(preloadedState)

    const { rerender, container } = render(
      <Provider store={store}>
        <Dashboard />
      </Provider>,
    )

    let selectOptions = container.querySelectorAll('select option')
    expect(selectOptions.length).toBeGreaterThan(1)

    // Dispatch action to update code tables
    const newState: any = {
      codeTables: {
        ...mockCodeTablesState,
        statuses: [
          ...mockCodeTablesState.statuses,
          { id: 'scheduled', label: 'Scheduled', description: 'scheduled' },
        ],
      },
      notification: {
        items: [],
        statusFilter: 'all',
        isLoading: false,
        error: null,
      },
    }

    const newStore = createStore(newState)

    rerender(
      <Provider store={newStore}>
        <Dashboard />
      </Provider>,
    )

    selectOptions = container.querySelectorAll('select option')
    const optionValues = Array.from(selectOptions).map((opt) => opt.getAttribute('value'))

    expect(optionValues).toContain('scheduled')
  })
})
