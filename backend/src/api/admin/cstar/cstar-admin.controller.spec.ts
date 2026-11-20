import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import type * as express from 'express'
import { CstarAdminController } from './cstar-admin.controller'
import { NotifyAdminGuard } from '../../../common/guards/notify-admin.guard'
import { ROLES_KEY } from '../../../common/decorators/roles.decorator'
import { SsoRole } from '../../../enum/sso-role.enum'
import type { CstarApiClient } from '../../../services/cstar/cstar-api.client'

describe('CstarAdminController', () => {
  const TENANT = 'e936010f-bb93-4430-87d9-e6e70b63e75f'
  const TENANT_USER = '6c6e1b2a-3f4d-4e5f-8a9b-0c1d2e3f4a5b'
  const AUTH = 'Bearer admin-token'
  const req = { headers: { authorization: AUTH } } as express.Request

  let client: Record<string, ReturnType<typeof vi.fn>>
  let controller: CstarAdminController

  beforeEach(() => {
    client = {
      getTenantUsers: vi.fn().mockResolvedValue([]),
      getTenantUser: vi.fn().mockResolvedValue({}),
      addTenantUser: vi.fn().mockResolvedValue({}),
      removeTenantUser: vi.fn().mockResolvedValue(undefined),
      getTenantUserRoles: vi.fn().mockResolvedValue([]),
      searchIdirUsers: vi.fn().mockResolvedValue([]),
      searchBceidUsers: vi.fn().mockResolvedValue([]),
    }
    controller = new CstarAdminController(client as unknown as CstarApiClient)
  })

  it('is guarded by NotifyAdminGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CstarAdminController)).toContain(NotifyAdminGuard)
  })

  it.each([
    'listTenantUsers',
    'getTenantUser',
    'addTenantUser',
    'removeTenantUser',
    'getTenantUserRoles',
    'searchIdirUsers',
    'searchBceidUsers',
  ] as const)('requires the NOTIFY_ADMIN SSO role for %s', (handler) => {
    const roles = Reflect.getMetadata(ROLES_KEY, CstarAdminController.prototype[handler])
    expect(roles).toEqual([SsoRole.NOTIFY_ADMIN])
  })

  it("lists a tenant's users with the admin's token", async () => {
    await controller.listTenantUsers(TENANT, req)
    expect(client.getTenantUsers).toHaveBeenCalledWith(TENANT, AUTH)
  })

  it('gets a tenant user, passing expand through', async () => {
    await controller.getTenantUser(TENANT, TENANT_USER, { expand: 'groups,roles' }, req)
    expect(client.getTenantUser).toHaveBeenCalledWith(TENANT, TENANT_USER, 'groups,roles', AUTH)
  })

  it('adds the posted user to the tenant', async () => {
    const user = {
      ssoUserId: 'fd33f1cef7ca4b19a71104d4ecf7066b',
      firstName: 'John',
      lastName: 'Smith',
      displayName: 'Smith, John',
      idpType: 'idir' as const,
    }
    await controller.addTenantUser(TENANT, { user }, req)
    expect(client.addTenantUser).toHaveBeenCalledWith(TENANT, user, AUTH)
  })

  it('removes a tenant user', async () => {
    await controller.removeTenantUser(TENANT, TENANT_USER, req)
    expect(client.removeTenantUser).toHaveBeenCalledWith(TENANT, TENANT_USER, AUTH)
  })

  it("gets a tenant user's roles", async () => {
    await controller.getTenantUserRoles(TENANT, TENANT_USER, req)
    expect(client.getTenantUserRoles).toHaveBeenCalledWith(TENANT, TENANT_USER, AUTH)
  })

  it('searches IDIR and BCeID users with the query as given', async () => {
    await controller.searchIdirUsers({ tenantId: TENANT, lastName: 'Smith' }, req)
    expect(client.searchIdirUsers).toHaveBeenCalledWith(
      { tenantId: TENANT, lastName: 'Smith' },
      AUTH,
    )

    await controller.searchBceidUsers({ tenantId: TENANT, email: 'a@b.ca' }, req)
    expect(client.searchBceidUsers).toHaveBeenCalledWith(
      { tenantId: TENANT, email: 'a@b.ca' },
      AUTH,
    )
  })
})
