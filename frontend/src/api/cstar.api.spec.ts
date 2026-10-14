import { beforeEach, describe, expect, it, vi } from 'vitest'
import cstarApi from './cstar.api'
import { generateApiParameters, get } from '@/common/api'

vi.mock('@/common/api', () => ({
  get: vi.fn(),
  generateApiParameters: vi.fn(
    (url: string, params?: unknown, _isBlob?: boolean, requiresAuthentication?: boolean) => ({
      url,
      params,
      requiresAuthentication,
    }),
  ),
}))

describe('cstar.api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchUserTenants', () => {
    it('wraps the proxy response in a data envelope', async () => {
      vi.mocked(get).mockResolvedValue({ tenants: [{ id: 't1', name: 'Tenant A' }] })

      await expect(cstarApi.fetchUserTenants()).resolves.toEqual({
        data: { tenants: [{ id: 't1', name: 'Tenant A' }] },
      })
      expect(get).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/frontend/auth/tenants',
          requiresAuthentication: true,
        }),
      )
    })

    it('returns an empty list when the proxy omits tenants', async () => {
      vi.mocked(get).mockResolvedValue({})

      await expect(cstarApi.fetchUserTenants()).resolves.toEqual({ data: { tenants: [] } })
    })
  })

  describe('fetchUserRoles', () => {
    it('asks for the roles of one tenant', async () => {
      vi.mocked(get).mockResolvedValue({ roles: ['NOTIFY_OPERATIONS_ADMIN'] })

      await expect(cstarApi.fetchUserRoles('t1')).resolves.toEqual({
        data: { roles: ['NOTIFY_OPERATIONS_ADMIN'] },
      })
      expect(get).toHaveBeenCalledWith(
        expect.objectContaining({ url: '/api/v1/frontend/auth/tenants/t1/roles' }),
      )
    })

    it('returns an empty list when the proxy omits roles', async () => {
      vi.mocked(get).mockResolvedValue({})

      await expect(cstarApi.fetchUserRoles('t1')).resolves.toEqual({ data: { roles: [] } })
    })
  })

  describe('fetchTenantGroups', () => {
    it('takes the tenant from the request header rather than a parameter', async () => {
      vi.mocked(get).mockResolvedValue({ groups: [{ id: 'g1', name: 'Group', description: '' }] })

      await expect(cstarApi.fetchTenantGroups()).resolves.toEqual([
        { id: 'g1', name: 'Group', description: '' },
      ])
      expect(get).toHaveBeenCalledWith(
        expect.objectContaining({ url: '/api/v1/frontend/events/cstar-groups' }),
      )
    })

    it('returns an empty list when the tenant has no groups', async () => {
      vi.mocked(get).mockResolvedValue({})

      await expect(cstarApi.fetchTenantGroups()).resolves.toEqual([])
    })
  })

  it('asks for JWT auth on every route', async () => {
    vi.mocked(get).mockResolvedValue({})

    await cstarApi.fetchUserTenants()
    await cstarApi.fetchUserRoles('t1')
    await cstarApi.fetchTenantGroups()

    for (const call of vi.mocked(generateApiParameters).mock.calls) {
      expect(call[3]).toBe(true)
    }
  })
})
