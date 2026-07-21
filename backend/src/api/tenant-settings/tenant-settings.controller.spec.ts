import { GUARDS_METADATA } from '@nestjs/common/constants'
import { Test, TestingModule } from '@nestjs/testing'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ROLES_KEY } from '../../common/decorators/roles.decorator'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { SsoRole } from '../../enum/sso-role.enum'
import { TenantSettingsController } from './tenant-settings.controller'
import { TenantSettingsService } from './tenant-settings.service'

describe('TenantSettingsController', () => {
  let controller: TenantSettingsController

  const mockService = {
    findByTenantId: vi.fn(),
    upsert: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantSettingsController],
      providers: [{ provide: TenantSettingsService, useValue: mockService }],
    })
      .overrideGuard(NotifyFrontendRoleGuard)
      .useValue({})
      .compile()

    controller = module.get(TenantSettingsController)
    vi.clearAllMocks()
  })

  it.each(['getSettings', 'updateSettings'] as const)(
    'requires the global NOTIFY_ADMIN role for %s',
    (methodName) => {
      const roles = Reflect.getMetadata(ROLES_KEY, TenantSettingsController.prototype[methodName])

      expect(roles).toEqual([SsoRole.NOTIFY_ADMIN])
      expect(roles).not.toContain('NOTIFY_OPERATIONS_ADMIN')
    },
  )

  it('uses the tenant resolved by the guard for GET', async () => {
    const settings = { alertEmail: 'alerts@example.com' }
    mockService.findByTenantId.mockResolvedValue(settings)

    await expect(controller.getSettings({ tenant: { id: 'tenant-1' } } as any)).resolves.toBe(
      settings,
    )
    expect(mockService.findByTenantId).toHaveBeenCalledWith('tenant-1')
  })

  it('uses the resolved tenant and user for PATCH', async () => {
    const settings = { alertEmail: null }
    mockService.upsert.mockResolvedValue(settings)

    await expect(
      controller.updateSettings({ tenant: { id: 'tenant-1' }, userGuid: 'user-1' } as any, {
        alertEmail: null,
      }),
    ).resolves.toBe(settings)
    expect(mockService.upsert).toHaveBeenCalledWith('tenant-1', null, 'user-1')
  })

  it('retains the tenant-aware frontend guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TenantSettingsController)).toEqual([
      NotifyFrontendRoleGuard,
    ])
  })
})
