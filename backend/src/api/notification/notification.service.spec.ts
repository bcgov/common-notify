import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NotificationService } from './notification.service'
import { NotificationRequest } from './entities/notification-request.entity'
import { NotificationStatus } from './schemas/create-notification-request'
import { TenantsService } from '../admin/tenants/tenants.service'
import { TemplatesRepository } from '../templates/templates.repository'
import { NotificationPubSubService } from './notification-pubsub.service'

const mockRepository = {
  create: vi.fn(),
  save: vi.fn(),
  find: vi.fn(),
  findOne: vi.fn(),
  findAndCount: vi.fn(),
  createQueryBuilder: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
}

const mockConfigService = {
  get: vi.fn().mockReturnValue(undefined),
}

const mockTenantsService = {
  findOne: vi.fn(),
  findByExternalId: vi.fn(),
}

const mockTemplatesRepository = {
  findById: vi.fn(),
}

const mockNotificationPubSubService = {
  publish: vi.fn(),
}

const createMockQueryBuilder = () => ({
  leftJoinAndSelect: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  andWhere: vi.fn().mockReturnThis(),
  addOrderBy: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  take: vi.fn().mockReturnThis(),
  getManyAndCount: vi.fn(),
})

describe('NotificationService', () => {
  let service: NotificationService

  beforeEach(async () => {
    mockRepository.createQueryBuilder.mockReturnValue(createMockQueryBuilder())

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: getRepositoryToken(NotificationRequest),
          useValue: mockRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: TenantsService,
          useValue: mockTenantsService,
        },
        {
          provide: TemplatesRepository,
          useValue: mockTemplatesRepository,
        },
        {
          provide: NotificationPubSubService,
          useValue: mockNotificationPubSubService,
        },
      ],
    }).compile()

    service = module.get<NotificationService>(NotificationService)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('create', () => {
    it('should create and save a notification request', async () => {
      const dto = { tenantId: 'tenant-uuid', createdBy: 'user1' }
      const mockNotification = {
        id: 'notif-uuid',
        tenantId: 'tenant-uuid',
        status: NotificationStatus.QUEUED,
        createdBy: 'user1',
        channelCode: null,
        recipients: null,
        delayedSendTime: null,
      }
      mockRepository.create.mockReturnValue(mockNotification)
      mockRepository.save.mockResolvedValue(mockNotification)

      const result = await service.create(dto)

      expect(mockRepository.create).toHaveBeenCalledWith({
        tenantId: dto.tenantId,
        status: NotificationStatus.QUEUED,
        createdBy: dto.createdBy,
        payload: undefined,
        channelCode: null,
        recipients: null,
        delayedSendTime: null,
      })
      expect(result).toEqual(mockNotification)
    })

    it('should use provided status when specified', async () => {
      const dto = {
        tenantId: 'tenant-uuid',
        status: NotificationStatus.PROCESSING,
        createdBy: 'user1',
      }
      const mockNotification = {
        id: 'notif-uuid',
        tenantId: 'tenant-uuid',
        status: NotificationStatus.PROCESSING,
        createdBy: 'user1',
        channelCode: null,
        recipients: null,
        delayedSendTime: null,
      }
      mockRepository.create.mockReturnValue(mockNotification)
      mockRepository.save.mockResolvedValue(mockNotification)

      const result = await service.create(dto)

      expect(mockRepository.create).toHaveBeenCalledWith({
        tenantId: dto.tenantId,
        status: NotificationStatus.PROCESSING,
        createdBy: dto.createdBy,
        payload: undefined,
        channelCode: null,
        recipients: null,
        delayedSendTime: null,
      })
      expect(result).toEqual(mockNotification)
    })
  })

  describe('findAll', () => {
    const mockTenant = {
      id: 'tenant-uuid',
      externalId: 'cstar-external-id',
      name: 'Test Tenant',
      slug: 'test-tenant',
    }

    it('should return paginated notifications using the default sort', async () => {
      mockTenantsService.findByExternalId.mockResolvedValue(mockTenant)
      const mockNotifications = [
        { id: 'notif-1', tenantId: 'tenant-uuid', status: NotificationStatus.QUEUED },
        { id: 'notif-2', tenantId: 'tenant-uuid', status: NotificationStatus.QUEUED },
      ]

      const queryBuilder = createMockQueryBuilder()
      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder)
      queryBuilder.getManyAndCount.mockResolvedValue([mockNotifications, 2])

      const result = await service.findAll('cstar-external-id', { page: 1, limit: 10 })

      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('notification')
      expect(queryBuilder.where).toHaveBeenCalledWith('notification.tenantId = :tenantId', {
        tenantId: 'tenant-uuid',
      })
      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('notification.createdAt', 'DESC')
      expect(queryBuilder.skip).toHaveBeenCalledWith(0)
      expect(queryBuilder.take).toHaveBeenCalledWith(10)
      expect(queryBuilder.getManyAndCount).toHaveBeenCalled()
      expect(result.count).toBe(2)
      expect(result.page).toBe(1)
      expect(result.limit).toBe(10)
      expect(result.totalPages).toBe(1)
    })

    it('should apply sort and filter query parameters', async () => {
      mockTenantsService.findByExternalId.mockResolvedValue(mockTenant)
      const mockNotifications = [
        { id: 'notif-1', tenantId: 'tenant-uuid', status: NotificationStatus.COMPLETED },
      ]

      const queryBuilder = createMockQueryBuilder()
      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder)
      queryBuilder.getManyAndCount.mockResolvedValue([mockNotifications, 1])

      await service.findAll('cstar-external-id', {
        page: 2,
        limit: 5,
        sort: '-createdAt,status',
        filter: ['status:eq:COMPLETED', 'channelCode:in:EMAIL|SMS'],
      })

      expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
        1,
        'LOWER(notification.status) = :filter_0',
        {
          filter_0: 'completed',
        },
      )
      expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
        2,
        'LOWER(notification.channelCode) IN (:...filter_1)',
        { filter_1: ['email', 'sms'] },
      )
      expect(queryBuilder.addOrderBy).toHaveBeenNthCalledWith(1, 'notification.createdAt', 'DESC')
      expect(queryBuilder.addOrderBy).toHaveBeenNthCalledWith(2, 'notification.status', 'ASC')
      expect(queryBuilder.skip).toHaveBeenCalledWith(5)
      expect(queryBuilder.take).toHaveBeenCalledWith(5)
    })

    it('should return empty data when tenant is not found', async () => {
      mockTenantsService.findByExternalId.mockResolvedValue(null)

      const result = await service.findAll('missing-tenant', { page: 1, limit: 10 })

      expect(result).toEqual({
        data: [],
        count: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      })
      expect(mockRepository.createQueryBuilder).not.toHaveBeenCalled()
    })
  })

  describe('findOne', () => {
    it('should return a notification when found', async () => {
      const id = 'notif-uuid'
      const tenantId = 'tenant-uuid'
      const mockNotification = { id, tenantId }
      mockRepository.findOne.mockResolvedValue(mockNotification)

      const result = await service.findOne(id, tenantId)

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id, tenantId },
        relations: ['tenant'],
      })
      expect(result).toEqual(mockNotification)
    })

    it('should throw NotFoundException when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      await expect(service.findOne('missing-id', 'tenant-uuid')).rejects.toThrow(NotFoundException)
    })

    it('should include the id in the NotFoundException message', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      await expect(service.findOne('missing-id', 'tenant-uuid')).rejects.toThrow(
        "Notification request with id 'missing-id' not found",
      )
    })
  })

  describe('update', () => {
    it('should update status and return the notification', async () => {
      const id = 'notif-uuid'
      const tenantId = 'tenant-uuid'
      const existing = {
        id,
        tenantId,
        status: NotificationStatus.QUEUED,
        updatedBy: null,
      }
      const dto = { status: NotificationStatus.COMPLETED, updatedBy: 'admin' }
      const updated = { ...existing, ...dto }
      mockRepository.findOne.mockResolvedValueOnce(existing)
      mockRepository.update.mockResolvedValue({ affected: 1 })
      mockRepository.findOne.mockResolvedValueOnce(updated)

      const result = await service.update(id, tenantId, dto)

      expect(mockRepository.update).toHaveBeenCalledWith({ id, tenantId }, dto)
      expect(result).toEqual(updated)
    })

    it('should only update provided fields', async () => {
      const id = 'notif-uuid'
      const tenantId = 'tenant-uuid'
      const existing = {
        id,
        tenantId,
        status: NotificationStatus.QUEUED,
        updatedBy: null,
      }
      const updated = { ...existing, updatedBy: 'admin' }
      mockRepository.findOne.mockResolvedValueOnce(existing)
      mockRepository.update.mockResolvedValue({ affected: 1 })
      mockRepository.findOne.mockResolvedValueOnce(updated)

      await service.update(id, tenantId, { updatedBy: 'admin' })

      expect(mockRepository.update).toHaveBeenCalledWith({ id, tenantId }, { updatedBy: 'admin' })
    })

    it('should throw NotFoundException when notification not found', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      await expect(service.update('missing-id', 'tenant-uuid', {})).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('validateBusinessRules', () => {
    const mockTenant = {
      id: 'tenant-123',
      name: 'Test Tenant',
      status: 'active',
    }

    beforeEach(() => {
      mockTenantsService.findOne.mockResolvedValue(mockTenant)
      mockTemplatesRepository.findById.mockResolvedValue(null)
    })

    describe('tenant validation', () => {
      it('should return error when tenant not found', async () => {
        mockTenantsService.findOne.mockResolvedValue(null)

        const request: any = {
          email: { recipients: { to: ['test@example.com'] } },
        }

        const errors = await service.validateBusinessRules('invalid-tenant', request)

        expect(errors).toContain("Tenant 'invalid-tenant' not found")
      })

      it('should return error when tenant is not active', async () => {
        const inactiveTenant = { ...mockTenant, status: 'inactive' }
        mockTenantsService.findOne.mockResolvedValue(inactiveTenant)

        const request: any = {
          email: { recipients: { to: ['test@example.com'] } },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).toContain('Tenant is not active (status: inactive)')
      })

      it('should succeed validation when tenant is active', async () => {
        const request: any = {
          email: { recipients: { to: ['test@example.com'] } },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).not.toContain('Tenant')
      })

      it('should stop validation if tenant not found', async () => {
        mockTenantsService.findOne.mockResolvedValue(null)

        const request: any = {
          email: { recipients: { to: ['test@example.com'] } },
        }

        const errors = await service.validateBusinessRules('invalid-tenant', request)

        // Should not validate other rules if tenant not found
        expect(errors.length).toBe(1)
        expect(errors[0]).toContain('Tenant')
      })
    })

    describe('recipients validation', () => {
      it('should require at least one recipient', async () => {
        const request: any = {
          email: { recipients: { to: [] } },
          sms: { recipients: { to: [] } },
          msgApp: { recipients: { to: [] } },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).toContain('At least one recipient is required (email, SMS, or msgApp)')
      })

      it('should accept request with email recipients only', async () => {
        const request: any = {
          email: { recipients: { to: ['test@example.com'] } },
          sms: { recipients: { to: [] } },
          msgApp: { recipients: { to: [] } },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).not.toContain('At least one recipient is required')
      })

      it('should accept request with SMS recipients only', async () => {
        const request: any = {
          email: { recipients: { to: [] } },
          sms: { recipients: { to: ['+12025551234'] } },
          msgApp: { recipients: { to: [] } },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).not.toContain('At least one recipient is required')
      })

      it('should accept request with msgApp recipients only', async () => {
        const request: any = {
          email: { recipients: { to: [] } },
          sms: { recipients: { to: [] } },
          msgApp: { recipients: { to: ['user-123'] } },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).not.toContain('At least one recipient is required')
      })

      it('should accept request with multiple channel recipients', async () => {
        const request: any = {
          email: { recipients: { to: ['test@example.com'] } },
          sms: { recipients: { to: ['+12025551234'] } },
          msgApp: { recipients: { to: ['user-123'] } },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).not.toContain('At least one recipient is required')
      })
    })

    describe('email validation', () => {
      it('should validate email recipient count', async () => {
        const request: any = {
          email: {
            recipients: { to: Array(101).fill('test@example.com') },
            content: { subject: 'Test', body: 'Test' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes('Too many email recipients'))).toBe(true)
      })

      it('should allow email recipients within limit', async () => {
        const request: any = {
          email: {
            recipients: { to: Array(50).fill('test@example.com') },
            content: { subject: 'Test', body: 'Test' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes('Too many email recipients'))).toBe(false)
      })

      it('should require email subject when not using template', async () => {
        const request: any = {
          email: {
            recipients: { to: ['test@example.com'] },
            content: { subject: '', body: 'Test' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).toContain('Email subject cannot be empty')
      })

      it('should require email body when not using template', async () => {
        const request: any = {
          email: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Test', body: '' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).toContain('Email body cannot be empty')
      })

      it('should allow email subject with whitespace only to be empty', async () => {
        const request: any = {
          email: {
            recipients: { to: ['test@example.com'] },
            content: { subject: '   ', body: 'Test' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).toContain('Email subject cannot be empty')
      })

      it('should validate email subject length', async () => {
        const longSubject = 'A'.repeat(501)
        const request: any = {
          email: {
            recipients: { to: ['test@example.com'] },
            content: { subject: longSubject, body: 'Test' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes('Email subject too long'))).toBe(true)
      })

      it('should validate email body length', async () => {
        const longBody = 'A'.repeat(50001)
        const request: any = {
          email: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Test', body: longBody },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes('Email body too long'))).toBe(true)
      })

      it('should skip content validation when using template', async () => {
        mockTemplatesRepository.findById.mockResolvedValue({
          id: 'template-123',
          channelCode: 'EMAIL',
        })

        const request: any = {
          email: {
            recipients: { to: ['test@example.com'] },
            content: { templateId: 'template-123' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        // Should not have content validation errors
        expect(errors.some((e) => e.includes('Email subject'))).toBe(false)
        expect(errors.some((e) => e.includes('Email body'))).toBe(false)
      })
    })

    describe('SMS validation', () => {
      it('should validate SMS recipient count', async () => {
        const request: any = {
          sms: {
            recipients: { to: Array(51).fill('+12025551234') },
            content: { body: 'Test' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes('Too many SMS recipients'))).toBe(true)
      })

      it('should allow SMS recipients within limit', async () => {
        const request: any = {
          sms: {
            recipients: { to: Array(30).fill('+12025551234') },
            content: { body: 'Test' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes('Too many SMS recipients'))).toBe(false)
      })

      it('should require SMS body when not using template', async () => {
        const request: any = {
          sms: {
            recipients: { to: ['+12025551234'] },
            content: { body: '' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).toContain('SMS body cannot be empty')
      })

      it('should validate SMS body length', async () => {
        const longBody = 'A'.repeat(1601)
        const request: any = {
          sms: {
            recipients: { to: ['+12025551234'] },
            content: { body: longBody },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes('SMS body too long'))).toBe(true)
      })

      it('should skip content validation when using template', async () => {
        mockTemplatesRepository.findById.mockResolvedValue({
          id: 'template-123',
          channelCode: 'SMS',
        })

        const request: any = {
          sms: {
            recipients: { to: ['+12025551234'] },
            content: { templateId: 'template-123' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        // Should not have content validation errors
        expect(errors.some((e) => e.includes('SMS body'))).toBe(false)
      })
    })

    describe('msgApp validation', () => {
      it('should validate msgApp recipient count', async () => {
        const request: any = {
          msgApp: {
            recipients: { to: Array(101).fill('user-123') },
            content: { body: 'Test' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes('Too many msgApp recipients'))).toBe(true)
      })

      it('should allow msgApp recipients within limit', async () => {
        const request: any = {
          msgApp: {
            recipients: { to: Array(50).fill('user-123') },
            content: { body: 'Test' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes('Too many msgApp recipients'))).toBe(false)
      })

      it('should require msgApp body when not using template', async () => {
        const request: any = {
          msgApp: {
            recipients: { to: ['user-123'] },
            content: { body: '' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).toContain('MsgApp body cannot be empty')
      })

      it('should validate msgApp body length', async () => {
        const longBody = 'A'.repeat(50001)
        const request: any = {
          msgApp: {
            recipients: { to: ['user-123'] },
            content: { body: longBody },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes('MsgApp body too long'))).toBe(true)
      })

      it('should skip content validation when using template', async () => {
        mockTemplatesRepository.findById.mockResolvedValue({
          id: 'template-123',
          channelCode: 'MSGAPP',
        })

        const request: any = {
          msgApp: {
            recipients: { to: ['user-123'] },
            content: { templateId: 'template-123' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        // Should not have content validation errors
        expect(errors.some((e) => e.includes('MsgApp body'))).toBe(false)
      })
    })

    describe('template validation', () => {
      it('should validate template exists when templateId provided', async () => {
        mockTemplatesRepository.findById.mockResolvedValue(null)

        const request: any = {
          email: {
            recipients: { to: ['test@example.com'] },
            content: { templateId: 'missing-template' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes("Template 'missing-template' not found"))).toBe(true)
      })

      it('should succeed when template exists', async () => {
        mockTemplatesRepository.findById.mockResolvedValue({
          id: 'template-123',
          channelCode: 'EMAIL',
        })

        const request: any = {
          email: {
            recipients: { to: ['test@example.com'] },
            content: { templateId: 'template-123' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes('not found'))).toBe(false)
      })

      it('should validate template channel matches requested channel', async () => {
        mockTemplatesRepository.findById.mockResolvedValue({
          id: 'template-123',
          channelCode: 'EMAIL',
        })

        const request: any = {
          sms: {
            recipients: { to: ['+12025551234'] },
            content: { templateId: 'template-123' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes("channel code 'EMAIL'"))).toBe(true)
      })

      it('should allow template when channel matches email', async () => {
        mockTemplatesRepository.findById.mockResolvedValue({
          id: 'template-123',
          channelCode: 'EMAIL',
        })

        const request: any = {
          email: {
            recipients: { to: ['test@example.com'] },
            content: { templateId: 'template-123' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes('channel code'))).toBe(false)
      })

      it('should allow template when channel matches SMS', async () => {
        mockTemplatesRepository.findById.mockResolvedValue({
          id: 'template-123',
          channelCode: 'SMS',
        })

        const request: any = {
          sms: {
            recipients: { to: ['+12025551234'] },
            content: { templateId: 'template-123' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes('channel code'))).toBe(false)
      })

      it('should allow template when channel matches msgApp', async () => {
        mockTemplatesRepository.findById.mockResolvedValue({
          id: 'template-123',
          channelCode: 'MSGAPP',
        })

        const request: any = {
          msgApp: {
            recipients: { to: ['user-123'] },
            content: { templateId: 'template-123' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes('channel code'))).toBe(false)
      })

      it('should handle template retrieval errors gracefully', async () => {
        mockTemplatesRepository.findById.mockRejectedValue(new Error('Database error'))

        const request: any = {
          email: {
            recipients: { to: ['test@example.com'] },
            content: { templateId: 'template-123' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes('Failed to validate template'))).toBe(true)
      })
    })

    describe('multiple channels validation', () => {
      it('should validate all channels when multiple provided', async () => {
        const request: any = {
          email: {
            recipients: { to: Array(101).fill('test@example.com') },
            content: { subject: 'Test', body: 'Test' },
          },
          sms: {
            recipients: { to: Array(51).fill('+12025551234') },
            content: { body: 'Test' },
          },
          msgApp: {
            recipients: { to: Array(101).fill('user-123') },
            content: { body: 'Test' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        // Should have errors for all three channels
        expect(errors.some((e) => e.includes('email recipients'))).toBe(true)
        expect(errors.some((e) => e.includes('SMS recipients'))).toBe(true)
        expect(errors.some((e) => e.includes('msgApp recipients'))).toBe(true)
      })

      it('should accumulate all errors', async () => {
        const request: any = {
          email: {
            recipients: { to: [] },
            content: { subject: '', body: '' },
          },
          sms: {
            recipients: { to: [] },
            content: { body: '' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.length).toBeGreaterThan(1)
      })
    })

    describe('edge cases', () => {
      it('should handle null recipients gracefully', async () => {
        const request: any = {
          email: { recipients: null },
          sms: { recipients: null },
          msgApp: { recipients: null },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).toContain('At least one recipient is required (email, SMS, or msgApp)')
      })

      it('should handle undefined recipients gracefully', async () => {
        const request: any = {
          email: { recipients: undefined },
          sms: { recipients: undefined },
          msgApp: { recipients: undefined },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).toContain('At least one recipient is required (email, SMS, or msgApp)')
      })

      it('should handle missing recipients.to field', async () => {
        const request: any = {
          email: { recipients: {} },
          sms: { recipients: {} },
          msgApp: { recipients: {} },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).toContain('At least one recipient is required (email, SMS, or msgApp)')
      })

      it('should handle missing content object', async () => {
        const request: any = {
          email: {
            recipients: { to: ['test@example.com'] },
            content: undefined,
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors.some((e) => e.includes('subject'))).toBe(true)
      })

      it('should validate empty request', async () => {
        const request: any = {}

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).toContain('At least one recipient is required (email, SMS, or msgApp)')
      })
    })

    describe('valid request scenarios', () => {
      it('should return empty error array for valid email request', async () => {
        const request: any = {
          email: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Test', body: 'Test body' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).toEqual([])
      })

      it('should return empty error array for valid SMS request', async () => {
        const request: any = {
          sms: {
            recipients: { to: ['+12025551234'] },
            content: { body: 'Test message' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).toEqual([])
      })

      it('should return empty error array for valid msgApp request', async () => {
        const request: any = {
          msgApp: {
            recipients: { to: ['user-123'] },
            content: { body: 'Test notification' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).toEqual([])
      })

      it('should return empty error array for valid multi-channel request', async () => {
        const request: any = {
          email: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Test', body: 'Test body' },
          },
          sms: {
            recipients: { to: ['+12025551234'] },
            content: { body: 'Test message' },
          },
          msgApp: {
            recipients: { to: ['user-123'] },
            content: { body: 'Test notification' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).toEqual([])
      })

      it('should return empty error array for valid template-based request', async () => {
        mockTemplatesRepository.findById.mockResolvedValue({
          id: 'template-123',
          channelCode: 'EMAIL',
        })

        const request: any = {
          email: {
            recipients: { to: ['test@example.com'] },
            content: { templateId: 'template-123' },
          },
        }

        const errors = await service.validateBusinessRules('tenant-123', request)

        expect(errors).toEqual([])
      })
    })
  })

  describe('getTenants', () => {
    it('should call tenantsService.findAll and return all tenants', async () => {
      const mockTenants = [
        { id: 'tenant-1', name: 'Tenant 1', slug: 'tenant-1' },
        { id: 'tenant-2', name: 'Tenant 2', slug: 'tenant-2' },
      ]
      mockTenantsService.findAll = vi.fn().mockResolvedValue(mockTenants)

      const result = await service.getTenants()

      expect(mockTenantsService.findAll).toHaveBeenCalled()
      expect(result).toEqual(mockTenants)
    })

    it('should handle empty tenant list', async () => {
      mockTenantsService.findAll = vi.fn().mockResolvedValue([])

      const result = await service.getTenants()

      expect(result).toEqual([])
    })

    it('should propagate errors from tenantsService', async () => {
      const error = new Error('Database connection failed')
      mockTenantsService.findAll = vi.fn().mockRejectedValue(error)

      await expect(service.getTenants()).rejects.toThrow('Database connection failed')
    })

    it('should return multiple tenants with correct structure', async () => {
      const mockTenants = [
        {
          id: 'tenant-uuid-1',
          name: 'Test Org 1',
          slug: 'test-org-1',
          status: 'active',
        },
        {
          id: 'tenant-uuid-2',
          name: 'Test Org 2',
          slug: 'test-org-2',
          status: 'inactive',
        },
      ]
      mockTenantsService.findAll = vi.fn().mockResolvedValue(mockTenants)

      const result = await service.getTenants()

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('tenant-uuid-1')
      expect(result[1].id).toBe('tenant-uuid-2')
    })
  })

  describe('mapToDto', () => {
    it('should map NotificationRequest entity to NotificationRequestDto', () => {
      const entity: any = {
        id: 'notif-123',
        tenantId: 'tenant-456',
        status: NotificationStatus.QUEUED,
        createdAt: new Date('2024-01-01'),
        createdBy: 'user1',
        updatedAt: new Date('2024-01-02'),
        updatedBy: 'user2',
        tenant: null,
      }

      // Access private method through any type casting
      const dto = (service as any).mapToDto(entity)

      expect(dto.id).toBe('notif-123')
      expect(dto.tenantId).toBe('tenant-456')
      expect(dto.status.code).toBe(NotificationStatus.QUEUED)
      expect(dto.createdAt).toEqual(new Date('2024-01-01'))
      expect(dto.createdBy).toBe('user1')
      expect(dto.updatedAt).toEqual(new Date('2024-01-02'))
      expect(dto.updatedBy).toBe('user2')
    })

    it('should include tenant data when present', () => {
      const mockTenant = {
        id: 'tenant-123',
        name: 'Test Tenant',
        slug: 'test-tenant',
      }
      const entity: any = {
        id: 'notif-123',
        tenantId: 'tenant-123',
        status: NotificationStatus.COMPLETED,
        createdAt: new Date(),
        createdBy: 'user1',
        updatedAt: new Date(),
        updatedBy: 'user2',
        tenant: mockTenant,
      }

      const dto = (service as any).mapToDto(entity)

      expect(dto.tenant).toBeDefined()
      expect(dto.tenant.id).toBe('tenant-123')
      expect(dto.tenant.name).toBe('Test Tenant')
      expect(dto.tenant.slug).toBe('test-tenant')
    })

    it('should handle entity without tenant', () => {
      const entity: any = {
        id: 'notif-456',
        tenantId: 'tenant-789',
        status: NotificationStatus.FAILED,
        createdAt: new Date(),
        createdBy: 'user3',
        updatedAt: new Date(),
        updatedBy: 'user4',
        tenant: null,
      }

      const dto = (service as any).mapToDto(entity)

      expect(dto.tenant).toBeUndefined()
    })

    it('should handle entity with undefined tenant', () => {
      const entity: any = {
        id: 'notif-789',
        tenantId: 'tenant-abc',
        status: NotificationStatus.PROCESSING,
        createdAt: new Date(),
        createdBy: 'user5',
        updatedAt: new Date(),
        updatedBy: 'user6',
        tenant: undefined,
      }

      const dto = (service as any).mapToDto(entity)

      expect(dto.tenant).toBeUndefined()
    })

    it('should preserve all status values', () => {
      const statuses = [
        NotificationStatus.QUEUED,
        NotificationStatus.PROCESSING,
        NotificationStatus.COMPLETED,
        NotificationStatus.FAILED,
      ]

      statuses.forEach((status) => {
        const entity: any = {
          id: 'notif-id',
          tenantId: 'tenant-id',
          status,
          createdAt: new Date(),
          createdBy: 'user',
          updatedAt: new Date(),
          updatedBy: 'user',
          tenant: null,
        }

        const dto = (service as any).mapToDto(entity)

        expect(dto.status.code).toBe(status)
      })
    })

    it('should map all tenant properties correctly', () => {
      const mockTenant = {
        id: 'tenant-xyz',
        name: 'Organization XYZ',
        slug: 'org-xyz',
        status: 'active',
        description: 'Test org',
      }
      const entity: any = {
        id: 'notif-123',
        tenantId: 'tenant-xyz',
        status: NotificationStatus.COMPLETED,
        createdAt: new Date(),
        createdBy: 'user1',
        updatedAt: new Date(),
        updatedBy: 'user2',
        tenant: mockTenant,
      }

      const dto = (service as any).mapToDto(entity)

      // Should only map specific tenant properties (id, name, slug)
      expect(dto.tenant).toHaveProperty('id')
      expect(dto.tenant).toHaveProperty('name')
      expect(dto.tenant).toHaveProperty('slug')
      // Extra properties should not be in mapped DTO
      expect(dto.tenant).not.toHaveProperty('status')
      expect(dto.tenant).not.toHaveProperty('description')
    })

    it('should handle null/undefined fields in entity', () => {
      const entity: any = {
        id: 'notif-null',
        tenantId: 'tenant-null',
        status: NotificationStatus.QUEUED,
        createdAt: new Date(),
        createdBy: null,
        updatedAt: null,
        updatedBy: null,
        tenant: null,
      }

      const dto = (service as any).mapToDto(entity)

      expect(dto.id).toBe('notif-null')
      expect(dto.createdBy).toBeNull()
      expect(dto.updatedAt).toBeNull()
      expect(dto.updatedBy).toBeNull()
      expect(dto.tenant).toBeUndefined()
    })

    it('should maintain date objects through mapping', () => {
      const createdDate = new Date('2024-01-15T10:30:00Z')
      const updatedDate = new Date('2024-01-16T14:45:00Z')
      const entity: any = {
        id: 'notif-dates',
        tenantId: 'tenant-dates',
        status: NotificationStatus.QUEUED,
        createdAt: createdDate,
        createdBy: 'user-creator',
        updatedAt: updatedDate,
        updatedBy: 'user-updater',
        tenant: null,
      }

      const dto = (service as any).mapToDto(entity)

      expect(dto.createdAt).toEqual(createdDate)
      expect(dto.updatedAt).toEqual(updatedDate)
      expect(dto.createdAt).toBeInstanceOf(Date)
      expect(dto.updatedAt).toBeInstanceOf(Date)
    })
  })
})
