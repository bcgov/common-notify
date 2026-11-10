import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import UserService, { AUTH_TOKEN } from './user-service'
import keycloak from '../keycloak'
vi.mock('../keycloak', () => ({
  default: {
    init: vi.fn(),
    updateToken: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    token: 'token',
    tokenParsed: { display_name: 'Test User', client_roles: ['NOTIFY_ADMIN'] },
    onTokenExpired: undefined,
  },
}))

describe('user service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())
  it.each([true, false])(
    'refreshes tokens and exposes claims (refreshed: %s)',
    async (refreshed) => {
      vi.mocked(keycloak.updateToken).mockResolvedValue(refreshed)
      await expect(UserService.getToken()).resolves.toBe('token')
      await expect(UserService.getUsername()).resolves.toBe('Test User')
      await expect(UserService.getTokenParsed()).resolves.toBe(keycloak.tokenParsed)
      await expect(UserService.isLoggedIn()).resolves.toBe(true)
      expect(UserService.getTokenSync()).toBe('token')
      expect(UserService.getTokenParsedSync()).toBe(keycloak.tokenParsed)
      expect(UserService.isLoggedInSync()).toBe(true)
      expect(localStorage.getItem(AUTH_TOKEN)).toBe(refreshed ? 'token' : null)
    },
  )
  it('logs in again on token refresh failure', async () => {
    vi.mocked(keycloak.updateToken).mockRejectedValue(new Error('Expired'))
    await expect(UserService.getToken()).rejects.toThrow('Expired')
    await expect(UserService.isLoggedIn()).resolves.toBe(false)
    expect(keycloak.login).toHaveBeenCalledTimes(2)
  })
  it('checks individual and multiple roles', () => {
    expect(UserService.hasRole('NOTIFY_ADMIN')).toBe(true)
    expect(UserService.hasRole('NOTIFY_VIEWER')).toBe(false)
    expect(UserService.hasRole(['NOTIFY_VIEWER', 'NOTIFY_ADMIN'])).toBe(true)
    expect(UserService.hasRole(['NOTIFY_VIEWER'])).toBe(false)
  })
  it.each([true, false])(
    'initializes authentication and handles token expiry: %s',
    async (authenticated) => {
      vi.mocked(keycloak.init).mockResolvedValue(authenticated)
      vi.mocked(keycloak.updateToken).mockResolvedValue(true)
      const callback = vi.fn()
      UserService.initKeycloak(callback)
      await Promise.resolve()
      expect(callback).toHaveBeenCalledTimes(authenticated ? 1 : 0)
      keycloak.onTokenExpired!()
      await Promise.resolve()
      expect(localStorage.getItem(AUTH_TOKEN)).toBe('token')
      vi.mocked(keycloak.updateToken).mockResolvedValue(false)
      keycloak.onTokenExpired!()
      await Promise.resolve()
    },
  )
  it('reports initialization failures and delegates explicit refresh callbacks', async () => {
    vi.mocked(keycloak.init).mockRejectedValue(new Error('SSO unavailable'))
    UserService.initKeycloak(vi.fn())
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled())
    vi.mocked(keycloak.updateToken).mockResolvedValue(true)
    const callback = vi.fn().mockReturnValue(true)
    await UserService.updateToken(callback)
    expect(callback).toHaveBeenCalledWith(true)
    vi.mocked(keycloak.updateToken).mockRejectedValue(new Error('Expired'))
    await UserService.updateToken(callback)
    expect(keycloak.login).toHaveBeenCalled()
  })
})
