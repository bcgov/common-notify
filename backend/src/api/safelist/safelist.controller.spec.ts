import { vi } from 'vitest'
import { ROLES_KEY } from '../../common/decorators/roles.decorator'
import { CstarRole } from '../../enum/cstar-role.enum'
import { SsoRole } from '../../enum/sso-role.enum'
import { SafelistController } from './safelist.controller'
import { SafelistService } from './safelist.service'

/** Roles declared on a handler, as NotifyFrontendRoleGuard reads them. */
function rolesFor(method: keyof SafelistController): string[] {
  return Reflect.getMetadata(ROLES_KEY, SafelistController.prototype[method]) ?? []
}

describe('SafelistController', () => {
  const safelistService = {
    listByTenant: vi.fn().mockResolvedValue([]),
    isEnforced: vi.fn().mockResolvedValue(true),
    getMaxEntries: vi.fn().mockResolvedValue(50),
    add: vi.fn(),
    remove: vi.fn(),
  }

  const controller = new SafelistController(safelistService as unknown as SafelistService)
  const request = { tenant: { id: 'tenant-1' }, userGuid: 'user-guid' } as any

  beforeEach(() => vi.clearAllMocks())

  describe('authorization', () => {
    // The regression: these were gated on the SSO NOTIFY_ADMIN role, which tenant staff do not
    // hold, so every Tenant Administrator got 403 on their own tenant's safelist.
    it.each(['list', 'add', 'remove'] as const)(
      'gates %s on CSTAR roles, never on an SSO role',
      (method) => {
        const roles = rolesFor(method)

        expect(roles.length).toBeGreaterThan(0)
        expect(roles).not.toContain(SsoRole.NOTIFY_ADMIN)
        expect(roles.every((role) => Object.values(CstarRole).includes(role as CstarRole))).toBe(
          true,
        )
      },
    )

    it('lets any member of the tenant read the safelist', () => {
      expect(rolesFor('list')).toEqual(
        expect.arrayContaining([
          CstarRole.NOTIFY_VIEWER,
          CstarRole.NOTIFY_TEMPLATE_EDITOR,
          CstarRole.NOTIFY_OPERATIONS_ADMIN,
        ]),
      )
    })

    it.each(['add', 'remove'] as const)('restricts %s to tenant administrators', (method) => {
      expect(rolesFor(method)).toEqual([CstarRole.NOTIFY_OPERATIONS_ADMIN])
    })
  })

  describe('delegation', () => {
    it('scopes the list to the tenant on the request and reports enforcement', async () => {
      const result = await controller.list(request, 'EMAIL')

      expect(safelistService.listByTenant).toHaveBeenCalledWith('tenant-1', 'EMAIL')
      expect(result).toEqual({ entries: [], enforced: true, maxEntries: 50 })
    })

    it('attributes an add to the calling user', async () => {
      const dto = { channelCode: 'EMAIL', recipient: 'qa@gov.bc.ca' } as any

      await controller.add(request, dto)

      expect(safelistService.add).toHaveBeenCalledWith('tenant-1', dto, 'user-guid')
    })

    it("scopes a removal to the tenant so one tenant cannot delete another's entry", async () => {
      await controller.remove(request, 'entry-1')

      expect(safelistService.remove).toHaveBeenCalledWith('tenant-1', 'entry-1', 'user-guid')
    })
  })
})
