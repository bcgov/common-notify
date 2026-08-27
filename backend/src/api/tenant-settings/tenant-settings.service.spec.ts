import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { vi } from 'vitest'
import { TenantSettingsService } from './tenant-settings.service'
import { TenantSettings } from './entities/tenant-settings.entity'
import { EmailLogoService } from '../email-logo/email-logo.service'

describe('TenantSettingsService', () => {
  let service: TenantSettingsService

  const mockTenantSettings: TenantSettings = {
    id: 'settings-uuid-1',
    tenantId: 'tenant-uuid-1',
    alertEmail: 'alerts@example.com',
    emailLogoId: null,
    defaultSenderEmail: 'noreply',
    emailNotificationsEnabled: true,
    replyToEmail: null,
    useCustomEmailHeader: false,
    customEmailHeaderTitle: null,
    emailAttachmentsEnabled: true,
    smsNotificationsEnabled: true,
    includeTenantNameInSms: true,
    internationalSmsEnabled: false,
    createdAt: new Date(),
    createdBy: 'creator-guid',
    updatedAt: new Date(),
    updatedBy: 'previous-updater-guid',
    isDeleted: false,
  }

  const mockRepository = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  }
  const mockEmailLogoService = {
    findByIdIfApproved: vi.fn().mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    }),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantSettingsService,
        {
          provide: getRepositoryToken(TenantSettings),
          useValue: mockRepository,
        },
        {
          provide: EmailLogoService,
          useValue: mockEmailLogoService,
        },
      ],
    }).compile()

    service = module.get<TenantSettingsService>(TenantSettingsService)
    vi.clearAllMocks()
  })

  describe('findByTenantId', () => {
    it('should return tenant settings when they exist', async () => {
      mockRepository.findOne.mockResolvedValue(mockTenantSettings)

      const result = await service.findByTenantId('tenant-uuid-1')

      expect(result).toEqual(mockTenantSettings)
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-uuid-1' },
      })
    })

    it('should return null when tenant settings do not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      const result = await service.findByTenantId('tenant-uuid-1')

      expect(result).toBeNull()
    })
  })

  describe('upsert', () => {
    it('should create tenant settings with createdBy when none exist', async () => {
      const createdSettings = {
        ...mockTenantSettings,
        alertEmail: 'new-alerts@example.com',
        createdBy: 'updater-guid',
      }
      mockRepository.findOne.mockResolvedValue(null)
      mockRepository.create.mockReturnValue(createdSettings)
      mockRepository.save.mockResolvedValue(createdSettings)

      const result = await service.upsert(
        'tenant-uuid-1',
        { alertEmail: 'new-alerts@example.com', defaultSenderEmail: 'noreply' },
        'updater-guid',
      )

      expect(mockRepository.create).toHaveBeenCalledWith({
        tenantId: 'tenant-uuid-1',
        alertEmail: 'new-alerts@example.com',
        defaultSenderEmail: 'noreply',
        createdBy: 'updater-guid',
      })
      expect(mockRepository.save).toHaveBeenCalledWith(createdSettings)
      expect(result).toEqual(createdSettings)
    })

    it('should update alertEmail and updatedBy when settings exist', async () => {
      const existingSettings = { ...mockTenantSettings }
      const savedSettings = {
        ...existingSettings,
        alertEmail: 'updated-alerts@example.com',
        updatedBy: 'updater-guid',
      }
      mockRepository.findOne.mockResolvedValue(existingSettings)
      mockRepository.save.mockResolvedValue(savedSettings)

      const result = await service.upsert(
        'tenant-uuid-1',
        { alertEmail: 'updated-alerts@example.com', defaultSenderEmail: 'noreply' },
        'updater-guid',
      )

      expect(existingSettings.alertEmail).toBe('updated-alerts@example.com')
      expect(existingSettings.updatedBy).toBe('updater-guid')
      expect(mockRepository.save).toHaveBeenCalledWith(existingSettings)
      expect(result).toEqual(savedSettings)
    })

    it('should clear alertEmail when it is set to null', async () => {
      const existingSettings = { ...mockTenantSettings }
      const savedSettings = { ...existingSettings, alertEmail: null, updatedBy: 'updater-guid' }
      mockRepository.findOne.mockResolvedValue(existingSettings)
      mockRepository.save.mockResolvedValue(savedSettings)

      const result = await service.upsert(
        'tenant-uuid-1',
        { alertEmail: null, defaultSenderEmail: 'noreply' },
        'updater-guid',
      )

      expect(existingSettings.alertEmail).toBeNull()
      expect(existingSettings.updatedBy).toBe('updater-guid')
      expect(mockRepository.save).toHaveBeenCalledWith(existingSettings)
      expect(result).toEqual(savedSettings)
    })

    it('should preserve existing updatedBy when updatedBy is omitted', async () => {
      const existingSettings = { ...mockTenantSettings }
      const savedSettings = { ...existingSettings, alertEmail: 'updated-alerts@example.com' }
      mockRepository.findOne.mockResolvedValue(existingSettings)
      mockRepository.save.mockResolvedValue(savedSettings)

      const result = await service.upsert('tenant-uuid-1', {
        alertEmail: 'updated-alerts@example.com',
        defaultSenderEmail: 'noreply',
      })

      expect(existingSettings.alertEmail).toBe('updated-alerts@example.com')
      expect(existingSettings.updatedBy).toBe('previous-updater-guid')
      expect(mockRepository.save).toHaveBeenCalledWith(existingSettings)
      expect(result).toEqual(savedSettings)
    })
  })

  describe('upsertEmailSettings', () => {
    const emailDto = {
      emailLogoId: '11111111-1111-4111-8111-111111111111',
      emailNotificationsEnabled: false,
      replyToEmail: 'noreply',
      emailAttachmentsEnabled: false,
    }

    it('should create settings with only the email fields when none exist', async () => {
      const createdSettings = { ...mockTenantSettings, ...emailDto, createdBy: 'updater-guid' }
      mockRepository.findOne.mockResolvedValue(null)
      mockRepository.create.mockReturnValue(createdSettings)
      mockRepository.save.mockResolvedValue(createdSettings)

      const result = await service.upsertEmailSettings('tenant-uuid-1', emailDto, 'updater-guid')

      expect(mockRepository.create).toHaveBeenCalledWith({
        tenantId: 'tenant-uuid-1',
        ...emailDto,
        createdBy: 'updater-guid',
      })
      expect(mockRepository.save).toHaveBeenCalledWith(createdSettings)
      expect(result).toEqual(createdSettings)
    })

    it('should update the email fields and updatedBy when settings exist', async () => {
      const existingSettings = { ...mockTenantSettings }
      const savedSettings = { ...existingSettings, ...emailDto, updatedBy: 'updater-guid' }
      mockRepository.findOne.mockResolvedValue(existingSettings)
      mockRepository.save.mockResolvedValue(savedSettings)

      const result = await service.upsertEmailSettings('tenant-uuid-1', emailDto, 'updater-guid')

      expect(existingSettings.emailNotificationsEnabled).toBe(false)
      expect(existingSettings.emailLogoId).toBe(emailDto.emailLogoId)
      expect(existingSettings.replyToEmail).toBe('noreply')
      expect(existingSettings.emailAttachmentsEnabled).toBe(false)
      expect(existingSettings.updatedBy).toBe('updater-guid')
      expect(mockRepository.save).toHaveBeenCalledWith(existingSettings)
      expect(result).toEqual(savedSettings)
    })

    it('should clear replyToEmail when it is set to null', async () => {
      const existingSettings = { ...mockTenantSettings }
      const dto = { ...emailDto, replyToEmail: null }
      const savedSettings = { ...existingSettings, ...dto, updatedBy: 'updater-guid' }
      mockRepository.findOne.mockResolvedValue(existingSettings)
      mockRepository.save.mockResolvedValue(savedSettings)

      const result = await service.upsertEmailSettings('tenant-uuid-1', dto, 'updater-guid')

      expect(existingSettings.replyToEmail).toBeNull()
      expect(mockRepository.save).toHaveBeenCalledWith(existingSettings)
      expect(result).toEqual(savedSettings)
    })

    it('should clear emailLogoId without an approval lookup', async () => {
      const existingSettings = { ...mockTenantSettings, emailLogoId: emailDto.emailLogoId }
      const dto = { ...emailDto, emailLogoId: null }
      mockRepository.findOne.mockResolvedValue(existingSettings)
      mockRepository.save.mockResolvedValue(existingSettings)

      await service.upsertEmailSettings('tenant-uuid-1', dto, 'updater-guid')

      expect(existingSettings.emailLogoId).toBeNull()
      expect(mockEmailLogoService.findByIdIfApproved).not.toHaveBeenCalled()
    })

    it('should reject an emailLogoId that is not approved', async () => {
      mockEmailLogoService.findByIdIfApproved.mockResolvedValueOnce(null)

      await expect(
        service.upsertEmailSettings('tenant-uuid-1', emailDto, 'updater-guid'),
      ).rejects.toThrow(BadRequestException)

      expect(mockRepository.findOne).not.toHaveBeenCalled()
      expect(mockRepository.save).not.toHaveBeenCalled()
    })

    it('should leave the tenant tab fields untouched', async () => {
      const existingSettings = { ...mockTenantSettings }
      mockRepository.findOne.mockResolvedValue(existingSettings)
      mockRepository.save.mockResolvedValue(existingSettings)

      await service.upsertEmailSettings('tenant-uuid-1', emailDto, 'updater-guid')

      expect(existingSettings.alertEmail).toBe('alerts@example.com')
      expect(existingSettings.defaultSenderEmail).toBe('noreply')
    })

    it('should preserve existing updatedBy when updatedBy is omitted', async () => {
      const existingSettings = { ...mockTenantSettings }
      mockRepository.findOne.mockResolvedValue(existingSettings)
      mockRepository.save.mockResolvedValue(existingSettings)

      await service.upsertEmailSettings('tenant-uuid-1', emailDto)

      expect(existingSettings.updatedBy).toBe('previous-updater-guid')
    })
  })

  describe('upsertSmsSettings', () => {
    const smsDto = {
      smsNotificationsEnabled: false,
      includeTenantNameInSms: false,
      internationalSmsEnabled: true,
    }

    it('should create settings with only the SMS fields when none exist', async () => {
      const createdSettings = { ...mockTenantSettings, ...smsDto, createdBy: 'updater-guid' }
      mockRepository.findOne.mockResolvedValue(null)
      mockRepository.create.mockReturnValue(createdSettings)
      mockRepository.save.mockResolvedValue(createdSettings)

      const result = await service.upsertSmsSettings('tenant-uuid-1', smsDto, 'updater-guid')

      expect(mockRepository.create).toHaveBeenCalledWith({
        tenantId: 'tenant-uuid-1',
        ...smsDto,
        createdBy: 'updater-guid',
      })
      expect(mockRepository.save).toHaveBeenCalledWith(createdSettings)
      expect(result).toEqual(createdSettings)
    })

    it('should update the SMS fields and updatedBy when settings exist', async () => {
      const existingSettings = { ...mockTenantSettings }
      const savedSettings = { ...existingSettings, ...smsDto, updatedBy: 'updater-guid' }
      mockRepository.findOne.mockResolvedValue(existingSettings)
      mockRepository.save.mockResolvedValue(savedSettings)

      const result = await service.upsertSmsSettings('tenant-uuid-1', smsDto, 'updater-guid')

      expect(existingSettings.smsNotificationsEnabled).toBe(false)
      expect(existingSettings.includeTenantNameInSms).toBe(false)
      expect(existingSettings.internationalSmsEnabled).toBe(true)
      expect(existingSettings.updatedBy).toBe('updater-guid')
      expect(mockRepository.save).toHaveBeenCalledWith(existingSettings)
      expect(result).toEqual(savedSettings)
    })

    it('should leave the tenant tab fields untouched', async () => {
      const existingSettings = { ...mockTenantSettings }
      mockRepository.findOne.mockResolvedValue(existingSettings)
      mockRepository.save.mockResolvedValue(existingSettings)

      await service.upsertSmsSettings('tenant-uuid-1', smsDto, 'updater-guid')

      expect(existingSettings.alertEmail).toBe('alerts@example.com')
      expect(existingSettings.defaultSenderEmail).toBe('noreply')
    })

    it('should preserve existing updatedBy when updatedBy is omitted', async () => {
      const existingSettings = { ...mockTenantSettings }
      mockRepository.findOne.mockResolvedValue(existingSettings)
      mockRepository.save.mockResolvedValue(existingSettings)

      await service.upsertSmsSettings('tenant-uuid-1', smsDto)

      expect(existingSettings.updatedBy).toBe('previous-updater-guid')
    })
  })
})
