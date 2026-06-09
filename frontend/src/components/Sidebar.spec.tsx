import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import authReducer from '@/redux/slices/auth.slice'
import cstarReducer from '@/redux/slices/cstar.slice'
import Sidebar from './Sidebar'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className, _activeProps, ...rest }: any) => (
    <a href={to} className={className} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/service/user-service', () => ({
  default: {
    hasRole: vi.fn(() => false),
    doLogout: vi.fn(),
  },
}))

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  username: 'testuser',
  displayName: 'Test User',
}

function makeStore(user: typeof mockUser | null = null, tenants: any[] = []) {
  return configureStore({
    reducer: { auth: authReducer, cstar: cstarReducer },
    preloadedState: {
      auth: {
        user,
        isAuthenticated: !!user,
        isInitializing: false,
        error: null,
      },
      cstar: {
        tenants,
        isLoading: false,
        error: null,
      },
    },
  })
}

function renderSidebar(user: typeof mockUser | null = null, tenants: any[] = []) {
  return render(
    <Provider store={makeStore(user, tenants)}>
      <Sidebar />
    </Provider>,
  )
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders primary nav items when user has CSTAR tenants', () => {
    const mockTenant = { id: 'tenant-1', name: 'Test Tenant' }
    renderSidebar(null, [mockTenant])

    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /notification events/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /templates/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /distribution lists/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
  })

  it('does not render admin link when user is not an admin', () => {
    renderSidebar()

    expect(screen.queryByRole('link', { name: /admin/i })).not.toBeInTheDocument()
  })

  it('renders admin link when user has the NOTIFY_ADMIN role', async () => {
    const user = userEvent.setup()
    const UserService = (await import('@/service/user-service')).default
    vi.mocked(UserService.hasRole).mockReturnValue(true)

    renderSidebar()

    // Admin is a toggle button to expand/collapse the submenu
    const adminButton = screen.getByRole('button', { name: /admin/i })
    expect(adminButton).toBeInTheDocument()

    // Click to expand the admin submenu
    await user.click(adminButton)

    // Now the current admin subitem links should be present
    expect(screen.getByRole('link', { name: /feature flags/i })).toBeInTheDocument()
  })

  it('renders the logged-in user display name', () => {
    renderSidebar(mockUser)

    expect(screen.getByText('Test User')).toBeInTheDocument()
  })

  it('does not render user section when no user is logged in', () => {
    renderSidebar(null)

    expect(screen.queryByText('Test User')).not.toBeInTheDocument()
  })

  it('renders collapse toggle button', () => {
    renderSidebar()

    expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument()
  })
})
