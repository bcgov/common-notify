import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CstarTenantAdminGuard } from './cstar-tenant-admin.guard'
import { CstarRole } from '../../../enum/cstar-role.enum'
import { SsoRole } from '../../../enum/sso-role.enum'
import type { CstarApiClient } from '../../../services/cstar/cstar-api.client'

// The parent AuthGuard passes whenever a user is on the request.
vi.mock('@nestjs/passport', () => ({
  AuthGuard: vi.fn(
    () =>
      class {
        async canActivate(context: ExecutionContext) {
          return !!context.switchToHttp().getRequest().user
        }
      },
  ),
}))

const PATH_TENANT = 'e936010f-bb93-4430-87d9-e6e70b63e75f'
const QUERY_TENANT = '11111111-2222-3333-4444-555555555555'
const AUTH = 'Bearer user-token'
const BOTH_ROLES = [SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN]

const notifyAdmin = { sub: 'admin', client_roles: [SsoRole.NOTIFY_ADMIN] }
const tenantUser = { sub: 'user', idir_user_guid: 'USERGUID', client_roles: [] }

function context(
  user: Record<string, unknown> | undefined,
  {
    params = {},
    query = {},
    headers = {},
  }: { params?: object; query?: object; headers?: Record<string, string> } = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, params, query, headers: { authorization: AUTH, ...headers } }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext
}

describe('CstarTenantAdminGuard', () => {
  let reflector: Reflector
  let getUserRoles: ReturnType<typeof vi.fn>
  let guard: CstarTenantAdminGuard

  beforeEach(() => {
    reflector = new Reflector()
    getUserRoles = vi.fn().mockResolvedValue([CstarRole.NOTIFY_OPERATIONS_ADMIN])
    guard = new CstarTenantAdminGuard(reflector, { getUserRoles } as unknown as CstarApiClient)
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(BOTH_ROLES)
  })

  it('refuses a request with no authenticated user', async () => {
    await expect(guard.canActivate(context(undefined))).resolves.toBe(false)
  })

  it('lets a NOTIFY_ADMIN manage any tenant without asking CSTAR', async () => {
    const ctx = context(notifyAdmin, { params: { tenantId: PATH_TENANT } })
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(getUserRoles).not.toHaveBeenCalled()
  })

  it("lets a tenant admin manage the path's tenant", async () => {
    const ctx = context(tenantUser, { params: { tenantId: PATH_TENANT } })
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(getUserRoles).toHaveBeenCalledWith(PATH_TENANT, 'USERGUID', AUTH)
  })

  it('ignores x-tenant-id', async () => {
    const ctx = context(tenantUser, { headers: { 'x-tenant-id': QUERY_TENANT } })
    await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException)
    expect(getUserRoles).not.toHaveBeenCalled()
  })

  it('checks the tenantId query on a route with no tenant in the path', async () => {
    const ctx = context(tenantUser, { query: { tenantId: QUERY_TENANT } })
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(getUserRoles).toHaveBeenCalledWith(QUERY_TENANT, 'USERGUID', AUTH)
  })

  it('refuses a repeated tenantId query', async () => {
    const ctx = context(tenantUser, { query: { tenantId: [QUERY_TENANT, PATH_TENANT] } })
    await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException)
  })

  it('needs a tenant from a tenant admin', async () => {
    await expect(guard.canActivate(context(tenantUser))).rejects.toThrow(BadRequestException)
  })

  it('refuses a user without the role in that tenant', async () => {
    getUserRoles.mockResolvedValue([CstarRole.NOTIFY_VIEWER])
    const ctx = context(tenantUser, { params: { tenantId: PATH_TENANT } })
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException)
  })

  it('refuses anyone but a NOTIFY_ADMIN on a NOTIFY_ADMIN-only route', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([SsoRole.NOTIFY_ADMIN])
    await expect(guard.canActivate(context(tenantUser))).rejects.toThrow(ForbiddenException)
    expect(getUserRoles).not.toHaveBeenCalled()
  })

  it('refuses a route with no @Roles()', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined)
    await expect(guard.canActivate(context(notifyAdmin))).rejects.toThrow(ForbiddenException)
  })

  it('refuses a token with no IDIR user GUID', async () => {
    const ctx = context(
      { sub: 'bceid-user', client_roles: [] },
      { params: { tenantId: PATH_TENANT } },
    )
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException)
    expect(getUserRoles).not.toHaveBeenCalled()
  })

  it("passes on CSTAR's refusal and reports any other lookup failure as unauthorized", async () => {
    const ctx = context(tenantUser, { params: { tenantId: PATH_TENANT } })
    getUserRoles.mockRejectedValueOnce(new ForbiddenException('not in tenant'))
    await expect(guard.canActivate(ctx)).rejects.toThrow('not in tenant')
    getUserRoles.mockRejectedValueOnce(new InternalServerErrorException('down'))
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException)
  })
})
