import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test-utils'
import UserService from '@/service/user-service'
import { Route } from './feature-flags'
vi.mock('@/service/user-service', () => ({ default: { hasRole: vi.fn() } }))
vi.mock('@/components/FeatureFlagAdmin', () => ({ default: () => <h1>Feature flags</h1> }))

describe('feature flag administration authorization', () => {
  beforeEach(() => vi.clearAllMocks())
  it('redirects users without the administrator role', () => {
    vi.mocked(UserService.hasRole).mockReturnValue(false)
    let destination: unknown
    try {
      Route.options.beforeLoad!({} as never)
    } catch (error) {
      destination = error
    }
    expect(destination).toMatchObject({ options: { to: '/not-authorized' } })
    expect(UserService.hasRole).toHaveBeenCalledWith('NOTIFY_ADMIN')
  })
  it('allows administrators through and renders the page', () => {
    vi.mocked(UserService.hasRole).mockReturnValue(true)
    expect(() => Route.options.beforeLoad!({} as never)).not.toThrow()
    const Component = Route.options.component as () => React.ReactElement
    render(<Component />)
    expect(screen.getByRole('heading', { name: 'Feature flags' })).toBeInTheDocument()
  })
})
