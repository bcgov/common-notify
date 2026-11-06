import { beforeEach, describe, it, expect, vi } from 'vitest'
import UserService from '@/service/user-service'
import { Route } from './route'
vi.mock('@/service/user-service', () => ({ default: { hasRole: vi.fn() } }))

describe('admin section authorization', () => {
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

  it('lets administrators through', () => {
    vi.mocked(UserService.hasRole).mockReturnValue(true)
    expect(() => Route.options.beforeLoad!({} as never)).not.toThrow()
  })
})
