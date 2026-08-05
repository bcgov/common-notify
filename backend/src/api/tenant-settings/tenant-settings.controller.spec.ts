import { GUARDS_METADATA } from '@nestjs/common/constants'
import { NotImplementedException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ROLES_KEY } from '../../common/decorators/roles.decorator'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { CstarRole } from '../../enum/cstar-role.enum'
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

  it.each(['getTenantSettings', 'getEmailSettings', 'getSmsSettings'] as const)(
    'allows any CSTAR role to read via %s',
    (methodName) => {
      const roles = Reflect.getMetadata(ROLES_KEY, TenantSettingsController.prototype[methodName])

      expect(roles).toEqual([
        CstarRole.NOTIFY_VIEWER,
        CstarRole.NOTIFY_TEMPLATE_EDITOR,
        CstarRole.NOTIFY_OPERATIONS_ADMIN,
      ])
    },
  )

  it.each(['updateTenantSettings', 'updateEmailSettings', 'updateSmsSettings'] as const)(
    'requires the tenant admin CSTAR role to update via %s',
    (methodName) => {
      const roles = Reflect.getMetadata(ROLES_KEY, TenantSettingsController.prototype[methodName])

      expect(roles).toEqual([CstarRole.NOTIFY_OPERATIONS_ADMIN])
    },
  )

  it('uses the tenant resolved by the guard for GET', async () => {
    const settings = { alertEmail: 'alerts@example.com' }
    mockService.findByTenantId.mockResolvedValue(settings)

    await expect(controller.getTenantSettings({ tenant: { id: 'tenant-1' } } as any)).resolves.toBe(
      settings,
    )
    expect(mockService.findByTenantId).toHaveBeenCalledWith('tenant-1')
  })

  it('uses the resolved tenant and user for PATCH', async () => {
    const settings = { alertEmail: null }
    mockService.upsert.mockResolvedValue(settings)

    const dto = { alertEmail: null, defaultSenderEmail: 'noreply' }
    await expect(
      controller.updateTenantSettings(
        { tenant: { id: 'tenant-1' }, userGuid: 'user-1' } as any,
        dto,
      ),
    ).resolves.toBe(settings)
    expect(mockService.upsert).toHaveBeenCalledWith('tenant-1', dto, 'user-1')
  })

  it.each([
    'getEmailSettings',
    'updateEmailSettings',
    'getSmsSettings',
    'updateSmsSettings',
  ] as const)('throws NotImplemented for the unbuilt %s route', (methodName) => {
    expect(() => (controller[methodName] as () => never)()).toThrow(NotImplementedException)
  })

  it('retains the tenant-aware frontend guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TenantSettingsController)).toEqual([
      NotifyFrontendRoleGuard,
    ])
  })
})
