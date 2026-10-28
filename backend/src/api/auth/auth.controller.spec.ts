import { HttpException } from '@nestjs/common'
import { vi } from 'vitest'
import type Express from 'express'
import { AuthController } from './auth.controller'
import { CstarApiClient } from '../../services/cstar/cstar-api.client'
import { TenantsService } from '../admin/tenants/tenants.service'

const encode = (payload: Record<string, unknown>) =>
  `header.${Buffer.from(JSON.stringify(payload)).toString('base64')}.signature`

const requestWith = (authorization?: string) =>
  ({ headers: { authorization } }) as unknown as Express.Request

describe('AuthController', () => {
  const mockCstarApiClient = {
    getUserTenants: vi.fn(),
    getUserRoles: vi.fn(),
  }
  const mockTenantsService = {
    upsertFromCstar: vi.fn(),
  }

  let controller: AuthController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new AuthController(
      mockCstarApiClient as unknown as CstarApiClient,
      mockTenantsService as unknown as TenantsService,
    )
  })

  describe('getUserTenants', () => {
    it('syncs every tenant and returns them', async () => {
      const tenants = [
        { id: 't-1', name: 'Tenant A' },
        { id: 't-2', name: 'Tenant B' },
      ]
      mockCstarApiClient.getUserTenants.mockResolvedValue(tenants)
      const authHeader = `Bearer ${encode({ idir_user_guid: 'user-1' })}`

      const result = await controller.getUserTenants(requestWith(authHeader))

      expect(result).toEqual({ tenants })
      expect(mockCstarApiClient.getUserTenants).toHaveBeenCalledWith('user-1', authHeader)
      expect(mockTenantsService.upsertFromCstar).toHaveBeenCalledTimes(2)
    })

    it('still returns all tenants when one sync fails', async () => {
      const tenants = [{ id: 't-1' }, { id: 't-2' }]
      mockCstarApiClient.getUserTenants.mockResolvedValue(tenants)
      mockTenantsService.upsertFromCstar
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce(undefined)
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await controller.getUserTenants(
        requestWith(`Bearer ${encode({ sub: 'user-1' })}`),
      )

      expect(result).toEqual({ tenants })
      expect(mockTenantsService.upsertFromCstar).toHaveBeenCalledTimes(2)
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('t-1'))
      consoleError.mockRestore()
    })

    it('returns an empty list when CSTAR returns no tenants', async () => {
      mockCstarApiClient.getUserTenants.mockResolvedValue(null)

      const result = await controller.getUserTenants(
        requestWith(`Bearer ${encode({ sub: 'user-1' })}`),
      )

      expect(result).toEqual({ tenants: [] })
      expect(mockTenantsService.upsertFromCstar).not.toHaveBeenCalled()
    })

    it('rejects a request without an Authorization header', async () => {
      await expect(controller.getUserTenants(requestWith())).rejects.toThrow(
        'Missing Authorization header',
      )
    })

    it('rejects a token without a user ID', async () => {
      await expect(controller.getUserTenants(requestWith(`Bearer ${encode({})}`))).rejects.toThrow(
        'User ID not found in JWT',
      )
    })

    it('wraps unexpected CSTAR errors', async () => {
      mockCstarApiClient.getUserTenants.mockRejectedValue(new Error('timeout'))

      await expect(
        controller.getUserTenants(requestWith(`Bearer ${encode({ sub: 'user-1' })}`)),
      ).rejects.toThrow(new HttpException('Failed to fetch tenants from CSTAR', 500))
    })
  })

  describe('getUserRoles', () => {
    it('returns the roles for the tenant', async () => {
      mockCstarApiClient.getUserRoles.mockResolvedValue(['NOTIFY_VIEWER'])
      const authHeader = `Bearer ${encode({ sub: 'user-1' })}`

      const result = await controller.getUserRoles(requestWith(authHeader), 't-1')

      expect(result).toEqual({ roles: ['NOTIFY_VIEWER'] })
      expect(mockCstarApiClient.getUserRoles).toHaveBeenCalledWith('t-1', 'user-1', authHeader)
    })

    it('wraps unexpected CSTAR errors', async () => {
      mockCstarApiClient.getUserRoles.mockRejectedValue(new Error('timeout'))

      await expect(
        controller.getUserRoles(requestWith(`Bearer ${encode({ sub: 'user-1' })}`), 't-1'),
      ).rejects.toThrow('Failed to fetch roles from CSTAR')
    })
  })
})
