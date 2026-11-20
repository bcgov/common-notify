import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTenantFeatureAccess } from '@/hooks/useTenantFeatureAccess'
import { Route } from './mcp-servers'
import UserService from '@/service/user-service'

vi.mock('@/hooks/useTenantFeatureAccess', () => ({ useTenantFeatureAccess: vi.fn() }))
vi.mock('@/pages/admin/McpServers', () => ({ default: () => <h1>MCP Servers</h1> }))
vi.mock('@/components/NotFound', () => ({ default: () => <p>404</p> }))
vi.mock('@/service/user-service', () => ({ default: { hasRole: vi.fn() } }))

describe('MCP administration feature access', () => {
  beforeEach(() => vi.clearAllMocks())
  const Page = Route.options.component as () => React.ReactElement

  it('rejects users without the administrator role', () => {
    vi.mocked(UserService.hasRole).mockReturnValue(false)
    expect(() => (Route.options.beforeLoad as () => void)()).toThrow()
  })

  it('allows administrators through the route guard', () => {
    vi.mocked(UserService.hasRole).mockReturnValue(true)
    expect(() => (Route.options.beforeLoad as () => void)()).not.toThrow()
  })

  it('blocks direct page access when MCP is disabled', () => {
    vi.mocked(useTenantFeatureAccess).mockReturnValue({ isResolved: true, canAccess: false })
    render(<Page />)
    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'MCP Servers' })).not.toBeInTheDocument()
  })

  it('renders the page when MCP is enabled', () => {
    vi.mocked(useTenantFeatureAccess).mockReturnValue({ isResolved: true, canAccess: true })
    render(<Page />)
    expect(screen.getByRole('heading', { name: 'MCP Servers' })).toBeInTheDocument()
    expect(useTenantFeatureAccess).toHaveBeenCalledWith('mcp_api')
  })
})
