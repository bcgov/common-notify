import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserService from '@/service/user-service'
import { Route } from './settings'

vi.mock('@/service/user-service', () => ({
  default: {
    hasRole: vi.fn(),
  },
}))

describe('/admin/settings authorization', () => {
  beforeEach(() => {
    vi.mocked(UserService.hasRole).mockReset()
  })

  it('allows a global admin', () => {
    vi.mocked(UserService.hasRole).mockReturnValue(true)

    expect(() => Route.options.beforeLoad?.({} as never)).not.toThrow()
  })

  it('redirects a non-global-admin user', () => {
    vi.mocked(UserService.hasRole).mockReturnValue(false)

    expect(() => Route.options.beforeLoad?.({} as never)).toThrow()
  })
})
