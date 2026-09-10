import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { Test, TestingModule } from '@nestjs/testing'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ROLES_KEY } from '../../common/decorators/roles.decorator'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { CstarRole } from '../../enum/cstar-role.enum'
import { TenantSettingsController } from './tenant-settings.controller'
import { TenantSettingsService } from './tenant-settings.service'
import { EmailLogoService } from '../email-logo/email-logo.service'

describe('TenantSettingsController', () => {
  let controller: TenantSettingsController

  const mockService = {
    findByTenantId: vi.fn(),
    upsert: vi.fn(),
    upsertEmailSettings: vi.fn(),
    upsertSmsSettings: vi.fn(),
  }
  const mockEmailLogoService = {
    findApproved: vi.fn(),
    buildPublicImageUrl: vi.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantSettingsController],
      providers: [
        { provide: TenantSettingsService, useValue: mockService },
        { provide: EmailLogoService, useValue: mockEmailLogoService },
      ],
    })
      .overrideGuard(NotifyFrontendRoleGuard)
      .useValue({})
      .compile()

    controller = module.get(TenantSettingsController)
    vi.clearAllMocks()
  })

  it('allows any CSTAR role to read via getSettings', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, TenantSettingsController.prototype.getSettings)

    expect(roles).toEqual([
      CstarRole.NOTIFY_VIEWER,
      CstarRole.NOTIFY_TEMPLATE_EDITOR,
      CstarRole.NOTIFY_OPERATIONS_ADMIN,
    ])
  })

  it('allows any CSTAR role to list approved email logos', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      TenantSettingsController.prototype.getApprovedEmailLogos,
    )

    expect(roles).toEqual([
      CstarRole.NOTIFY_VIEWER,
      CstarRole.NOTIFY_TEMPLATE_EDITOR,
      CstarRole.NOTIFY_OPERATIONS_ADMIN,
    ])
  })

  it.each(['updateTenantSettings', 'updateEmailSettings', 'updateSmsSettings'] as const)(
    'requires the tenant admin CSTAR role to update via %s',
    (methodName) => {
      const roles = Reflect.getMetadata(ROLES_KEY, TenantSettingsController.prototype[methodName])

      expect(roles).toEqual([CstarRole.NOTIFY_OPERATIONS_ADMIN])
    },
  )

  // Every tab reads through one suffix-less route; only the writes are per-tab.
  it('exposes a single suffix-less read alongside the per-tab writes', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TenantSettingsController.prototype.getSettings)).toBe(
      '/',
    )
    expect(
      Reflect.getMetadata(PATH_METADATA, TenantSettingsController.prototype.updateTenantSettings),
    ).toBe('tenant')
    expect(
      Reflect.getMetadata(PATH_METADATA, TenantSettingsController.prototype.updateEmailSettings),
    ).toBe('email')
    expect(
      Reflect.getMetadata(PATH_METADATA, TenantSettingsController.prototype.updateSmsSettings),
    ).toBe('sms')
    expect(
      Reflect.getMetadata(PATH_METADATA, TenantSettingsController.prototype.getApprovedEmailLogos),
    ).toBe('email-logos')
  })

  it('returns approved logos with service-built public image URLs', async () => {
    mockEmailLogoService.findApproved.mockResolvedValue([
      { id: 'logo-1', name: 'Primary', fileKey: 'logos/primary.png' },
    ])
    mockEmailLogoService.buildPublicImageUrl.mockReturnValue(
      'https://gateway.example.test/logos/logo-1/image',
    )

    await expect(controller.getApprovedEmailLogos()).resolves.toEqual([
      {
        id: 'logo-1',
        name: 'Primary',
        imageUrl: 'https://gateway.example.test/logos/logo-1/image',
      },
    ])
    expect(mockEmailLogoService.findApproved).toHaveBeenCalledOnce()
    expect(mockEmailLogoService.buildPublicImageUrl).toHaveBeenCalledWith('logo-1')
  })

  it('uses the tenant resolved by the guard for GET', async () => {
    const settings = { alertEmail: 'alerts@example.com', smsNotificationsEnabled: false }
    mockService.findByTenantId.mockResolvedValue(settings)

    await expect(controller.getSettings({ tenant: { id: 'tenant-1' } } as any)).resolves.toBe(
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

  it('uses the resolved tenant and user for the SMS PATCH', async () => {
    const settings = { smsNotificationsEnabled: false }
    mockService.upsertSmsSettings.mockResolvedValue(settings)

    const dto = {
      smsNotificationsEnabled: false,
      includeTenantNameInSms: true,
      internationalSmsEnabled: false,
    }
    await expect(
      controller.updateSmsSettings({ tenant: { id: 'tenant-1' }, userGuid: 'user-1' } as any, dto),
    ).resolves.toBe(settings)
    expect(mockService.upsertSmsSettings).toHaveBeenCalledWith('tenant-1', dto, 'user-1')
  })

  it('uses the resolved tenant and user for the email PATCH', async () => {
    const settings = { emailNotificationsEnabled: false }
    mockService.upsertEmailSettings.mockResolvedValue(settings)

    const dto = {
      emailLogoId: null,
      emailNotificationsEnabled: false,
      replyToEmail: 'noreply',
      emailAttachmentsEnabled: true,
    }
    await expect(
      controller.updateEmailSettings(
        { tenant: { id: 'tenant-1' }, userGuid: 'user-1' } as any,
        dto,
      ),
    ).resolves.toBe(settings)
    expect(mockService.upsertEmailSettings).toHaveBeenCalledWith('tenant-1', dto, 'user-1')
  })

  it('retains the tenant-aware frontend guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TenantSettingsController)).toEqual([
      NotifyFrontendRoleGuard,
    ])
  })
})
