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
      getTenantGroups: vi.fn().mockResolvedValue([]),
      getGroup: vi.fn().mockResolvedValue({}),
      createGroup: vi.fn().mockResolvedValue({}),
      updateGroup: vi.fn().mockResolvedValue({}),
      addGroupUser: vi.fn().mockResolvedValue({}),
      removeGroupUser: vi.fn().mockResolvedValue(undefined),
      getGroupRoles: vi.fn().mockResolvedValue([]),
      updateGroupRoles: vi.fn().mockResolvedValue([]),
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
    'listGroups',
    'getGroup',
    'createGroup',
    'updateGroup',
    'addGroupUser',
    'removeGroupUser',
    'getGroupRoles',
    'updateGroupRoles',
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

  describe('groups', () => {
    const GROUP = '3a3fafee-d41b-4fbe-92df-62dbebf0f73a'
    const GROUP_USER = '8f01087b-edfe-4957-97c4-f0aece2bc514'

    it('lists groups and gets one group', async () => {
      await controller.listGroups(TENANT, req)
      expect(client.getTenantGroups).toHaveBeenCalledWith(TENANT, AUTH)

      await controller.getGroup(TENANT, GROUP, req)
      expect(client.getGroup).toHaveBeenCalledWith(TENANT, GROUP, AUTH)
    })

    it('creates and updates groups', async () => {
      await controller.createGroup(TENANT, { name: 'Editors', description: 'd' }, req)
      expect(client.createGroup).toHaveBeenCalledWith(
        TENANT,
        { name: 'Editors', description: 'd' },
        AUTH,
      )

      await controller.updateGroup(TENANT, GROUP, { name: 'Renamed' }, req)
      expect(client.updateGroup).toHaveBeenCalledWith(TENANT, GROUP, { name: 'Renamed' }, AUTH)
    })

    it('adds and removes group users', async () => {
      const user = {
        ssoUserId: 'fd33f1cef7ca4b19a71104d4ecf7066b',
        firstName: 'John',
        lastName: 'Smith',
        displayName: 'Smith, John',
        idpType: 'idir' as const,
      }
      await controller.addGroupUser(TENANT, GROUP, { user, confirmOtherServices: ['chefs'] }, req)
      expect(client.addGroupUser).toHaveBeenCalledWith(TENANT, GROUP, user, ['chefs'], AUTH)

      await controller.removeGroupUser(TENANT, GROUP, GROUP_USER, req)
      expect(client.removeGroupUser).toHaveBeenCalledWith(TENANT, GROUP, GROUP_USER, AUTH)
    })

    it("gets and updates a group's roles", async () => {
      await controller.getGroupRoles(TENANT, GROUP, req)
      expect(client.getGroupRoles).toHaveBeenCalledWith(TENANT, GROUP, AUTH)

      const sharedServices = [
        { id: GROUP_USER, sharedServiceRoles: [{ id: GROUP, enabled: true }] },
      ]
      await controller.updateGroupRoles(TENANT, GROUP, { sharedServices }, req)
      expect(client.updateGroupRoles).toHaveBeenCalledWith(TENANT, GROUP, { sharedServices }, AUTH)
    })
  })
})
