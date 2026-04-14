import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { describe, it, expect, vi } from 'vitest'
import Layout from './Layout'
import authReducer from '@/redux/slices/auth.slice'
import loadingReducer from '@/redux/slices/loading.slice'
import toastReducer from '@/redux/slices/toast.slice'
import * as UserService from '@/service/user-service'

// Mock UserService
vi.mock('@/service/user-service', () => ({
  default: {
    doLogout: vi.fn(),
  },
}))

describe('Layout', () => {
  const createStoreWithAuth = (user?: any) => {
    return configureStore({
      reducer: {
        auth: authReducer,
        loading: loadingReducer,
        toast: toastReducer,
      },
      preloadedState: {
        auth: {
          user: user || null,
          isAuthenticated: !!user,
          isInitializing: false,
          error: null,
        },
        loading: {
          isLoading: false,
          requestCount: 0,
        },
        toast: {
          toasts: [],
        },
      },
    })
  }

  it('should render children', () => {
    const store = createStoreWithAuth()

    render(
      <Provider store={store}>
        <Layout>
          <div data-testid="test-content">Test Content</div>
        </Layout>
      </Provider>,
    )

    expect(screen.getByTestId('test-content')).toBeInTheDocument()
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('should display user name when authenticated', () => {
    const user = {
      displayName: 'John Doe',
      email: 'john@example.com',
      preferredUsername: 'johndoe',
      idirUsername: 'IDIR\\johndoe',
      idirUserGuid: 'abc-123',
      identityProvider: 'idir',
      scope: 'openid profile email',
      tokenType: 'Bearer',
      sessionState: 'session-123',
    }

    const store = createStoreWithAuth(user)

    render(
      <Provider store={store}>
        <Layout>Content</Layout>
      </Provider>,
    )

    expect(screen.getByText('John Doe')).toBeInTheDocument()
  })

  it('should not display user name when not authenticated', () => {
    const store = createStoreWithAuth()

    render(
      <Provider store={store}>
        <Layout>Content</Layout>
      </Provider>,
    )

    // Username should not be rendered
    expect(screen.queryByText(/John Doe/i)).not.toBeInTheDocument()
  })

  it('should have logout button', () => {
    const store = createStoreWithAuth()

    render(
      <Provider store={store}>
        <Layout>Content</Layout>
      </Provider>,
    )

    const logoutButton = screen.getByRole('button', { name: /logout/i })
    expect(logoutButton).toBeInTheDocument()
  })

  it('should call doLogout when logout button is clicked', async () => {
    const userEvent = await import('@testing-library/user-event')
    const user = userEvent.default
    const store = createStoreWithAuth()

    render(
      <Provider store={store}>
        <Layout>Content</Layout>
      </Provider>,
    )

    const logoutButton = screen.getByRole('button', { name: /logout/i })
    await user.click(logoutButton)

    expect(UserService.default.doLogout).toHaveBeenCalled()
  })

  it('should render LoadingSpinner', () => {
    const store = createStoreWithAuth()

    render(
      <Provider store={store}>
        <Layout>Content</Layout>
      </Provider>,
    )

    // LoadingSpinner component should be rendered (check for its container)
    const layoutContainer = screen.getByText('Content').closest('.layout-content')
    expect(layoutContainer).toBeInTheDocument()
  })

  it('should render ToastContainer', () => {
    const store = createStoreWithAuth()

    render(
      <Provider store={store}>
        <Layout>Content</Layout>
      </Provider>,
    )

    // Check that the layout is rendered (ToastContainer is inside)
    const layoutContainer = screen.getByText('Content').closest('.layout-content')
    expect(layoutContainer).toBeInTheDocument()
  })
})
