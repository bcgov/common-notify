import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NotificationFrontendController } from './notification-frontend.controller'
import { NotificationService } from './notification.service'
import { NotificationPubSubService } from './notification-pubsub.service'
import { NotificationStatus } from './schemas/create-notification-request'
import { TenantsService } from '../admin/tenants/tenants.service'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { FeatureFlagService } from '../feature-flag/feature-flag.service'

const mockNotificationService = {
  findAll: vi.fn(),
}

const mockNotificationPubSubService = {
  publish: vi.fn(),
  subscribe: vi.fn(),
}

const mockTenantsService = {
  findByExternalId: vi.fn(),
  findOne: vi.fn(),
}

const mockFeatureFlagService = {
  getFlagsForTenant: vi.fn().mockResolvedValue({
    sms_notifications: true,
  }),
}

describe('NotificationFrontendController', () => {
  let controller: NotificationFrontendController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationFrontendController],
      providers: [
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
        {
          provide: NotificationPubSubService,
          useValue: mockNotificationPubSubService,
        },
        {
          provide: TenantsService,
          useValue: mockTenantsService,
        },
        {
          provide: FeatureFlagService,
          useValue: mockFeatureFlagService,
        },
      ],
    })
      .overrideGuard(NotifyFrontendRoleGuard)
      .useValue({})
      .compile()

    controller = module.get<NotificationFrontendController>(NotificationFrontendController)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('findAll', () => {
    it('should delegate to notificationService.findAll with default parameters', async () => {
      const mockResponse = {
        data: [],
        count: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      const result = await controller.findAll('tenant-123', {} as any)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith('tenant-123', {})
      expect(result).toEqual(mockResponse)
    })

    it('should parse page parameter as integer', async () => {
      const mockResponse = {
        data: [],
        count: 0,
        page: 2,
        limit: 10,
        totalPages: 0,
      }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      await controller.findAll('tenant-456', { page: 2 } as any)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith('tenant-456', { page: 2 })
    })

    it('should parse limit parameter as integer', async () => {
      const mockResponse = {
        data: [],
        count: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      await controller.findAll('tenant-789', { limit: 20 } as any)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith('tenant-789', { limit: 20 })
    })

    it('should pass sort and filter query parameters to service', async () => {
      const mockResponse = {
        data: [{ id: 'notif-1', status: NotificationStatus.COMPLETED }],
        count: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      await controller.findAll('tenant-111', {
        sort: '-createdAt,status',
        filter: ['status:eq:COMPLETED', 'createdBy:like:smith'],
      } as any)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith('tenant-111', {
        sort: '-createdAt,status',
        filter: ['status:eq:COMPLETED', 'createdBy:like:smith'],
      })
    })

    it('should handle all parameters together', async () => {
      const mockResponse = {
        data: [{ id: 'notif-1', status: NotificationStatus.QUEUED }],
        count: 5,
        page: 3,
        limit: 15,
        totalPages: 1,
      }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      await controller.findAll('tenant-222', {
        page: 3,
        limit: 15,
        sort: '-createdAt',
        filter: [
          'status:eq:QUEUED',
          'channelCode:in:EMAIL|SMS',
          'createdAt:gte:2026-01-01T00:00:00.000Z',
        ],
      } as any)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith('tenant-222', {
        page: 3,
        limit: 15,
        sort: '-createdAt',
        filter: [
          'status:eq:QUEUED',
          'channelCode:in:EMAIL|SMS',
          'createdAt:gte:2026-01-01T00:00:00.000Z',
        ],
      })
      expect(mockResponse.page).toBe(3)
      expect(mockResponse.limit).toBe(15)
    })

    it('should return paginated response from service', async () => {
      const mockNotifications = [
        { id: 'notif-1', status: NotificationStatus.QUEUED },
        { id: 'notif-2', status: NotificationStatus.PROCESSING },
      ]
      const mockResponse = {
        data: mockNotifications,
        count: 25,
        page: 1,
        limit: 10,
        totalPages: 3,
      }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      const result = await controller.findAll('tenant-333', { page: 1, limit: 10 } as any)

      expect(result.data).toEqual(mockNotifications)
      expect(result.count).toBe(25)
      expect(result.totalPages).toBe(3)
    })

    it('should handle empty response from service', async () => {
      const mockResponse = {
        data: [],
        count: 0,
        page: 5,
        limit: 10,
        totalPages: 0,
      }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      const result = await controller.findAll('tenant-444', { page: 5, limit: 10 } as any)

      expect(result.data).toEqual([])
      expect(result.count).toBe(0)
    })

    it('should handle service errors', async () => {
      const error = new Error('Database error')
      mockNotificationService.findAll.mockRejectedValue(error)

      await expect(controller.findAll('tenant-555', {} as any)).rejects.toThrow('Database error')
    })

    it('should preserve the raw query object from the framework', async () => {
      const mockResponse = {
        data: [],
        count: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      }
      // parseInt('invalid', 10) returns NaN
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      await controller.findAll('tenant-666', { page: 'invalid' } as any)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith('tenant-666', {
        page: 'invalid',
      })
    })

    it('should pass a repeatable filter list without modification', async () => {
      const mockResponse = {
        data: [],
        count: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      await controller.findAll('tenant-777', {
        filter: ['status:eq:QUEUED', 'status:ne:COMPLETED'],
      } as any)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith('tenant-777', {
        filter: ['status:eq:QUEUED', 'status:ne:COMPLETED'],
      })
    })

    it('should support large page numbers', async () => {
      const mockResponse = {
        data: [],
        count: 0,
        page: 999,
        limit: 10,
        totalPages: 100,
      }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      await controller.findAll('tenant-888', { page: 999 } as any)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith('tenant-888', { page: 999 })
    })

    it('should support large limit values', async () => {
      const mockResponse = {
        data: [],
        count: 0,
        page: 1,
        limit: 100,
        totalPages: 1,
      }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      await controller.findAll('tenant-999', { limit: 100 } as any)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith('tenant-999', { limit: 100 })
    })

    it('should handle multiple status values (service handles filtering)', async () => {
      const mockResponse = {
        data: [],
        count: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      const allStatuses = [
        NotificationStatus.QUEUED,
        NotificationStatus.PROCESSING,
        NotificationStatus.COMPLETED,
        NotificationStatus.FAILED,
      ]

      for (const status of allStatuses) {
        await controller.findAll('tenant-aaa', { filter: [`status:eq:${status}`] } as any)
        expect(mockNotificationService.findAll).toHaveBeenCalledWith('tenant-aaa', {
          filter: [`status:eq:${status}`],
        })
      }
    })

    it('should maintain service response structure integrity', async () => {
      const mockNotification = {
        id: 'unique-id',
        tenantId: 'tenant-id',
        status: NotificationStatus.COMPLETED,
        createdAt: new Date(),
        createdBy: 'user-id',
        updatedAt: new Date(),
        updatedBy: 'admin-id',
      }
      const mockResponse = {
        data: [mockNotification],
        count: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      const result = await controller.findAll(undefined as any, {} as any)

      expect(result.data[0]).toEqual(mockNotification)
      expect(result.data[0].id).toBe('unique-id')
      expect(result.data[0].status).toBe(NotificationStatus.COMPLETED)
    })
  })
})
