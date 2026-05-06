import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { NotificationFrontendController } from './notification-frontend.controller'
import { NotificationService } from './notification.service'
import { NotificationStatus } from './schemas/create-notification-request'

const mockNotificationService = {
  findAll: vi.fn(),
}

describe('NotificationFrontendController', () => {
  let controller: NotificationFrontendController
  let service: NotificationService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationFrontendController],
      providers: [
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile()

    controller = module.get<NotificationFrontendController>(NotificationFrontendController)
    service = module.get<NotificationService>(NotificationService)
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

      const result = await controller.findAll(undefined, undefined, undefined)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith(1, 10, undefined)
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

      await controller.findAll('2', undefined, undefined)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith(2, 10, undefined)
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

      await controller.findAll(undefined, '20', undefined)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith(1, 20, undefined)
    })

    it('should pass status filter to service', async () => {
      const mockResponse = {
        data: [{ id: 'notif-1', status: NotificationStatus.COMPLETED }],
        count: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      await controller.findAll(undefined, undefined, NotificationStatus.COMPLETED)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith(
        1,
        10,
        NotificationStatus.COMPLETED,
      )
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

      await controller.findAll('3', '15', NotificationStatus.QUEUED)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith(3, 15, NotificationStatus.QUEUED)
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

      const result = await controller.findAll('1', '10', undefined)

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

      const result = await controller.findAll('5', '10', undefined)

      expect(result.data).toEqual([])
      expect(result.count).toBe(0)
    })

    it('should handle service errors', async () => {
      const error = new Error('Database error')
      mockNotificationService.findAll.mockRejectedValue(error)

      await expect(controller.findAll(undefined, undefined, undefined)).rejects.toThrow(
        'Database error',
      )
    })

    it('should handle non-numeric page parameter', async () => {
      const mockResponse = {
        data: [],
        count: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      }
      // parseInt('invalid', 10) returns NaN
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      await controller.findAll('invalid', undefined, undefined)

      // Service should be called with NaN
      expect(mockNotificationService.findAll).toHaveBeenCalled()
    })

    it('should handle non-numeric limit parameter', async () => {
      const mockResponse = {
        data: [],
        count: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      await controller.findAll(undefined, 'invalid', undefined)

      expect(mockNotificationService.findAll).toHaveBeenCalled()
    })

    it('should support zero-based and large page numbers', async () => {
      const mockResponse = {
        data: [],
        count: 0,
        page: 999,
        limit: 10,
        totalPages: 100,
      }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      await controller.findAll('999', '10', undefined)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith(999, 10, undefined)
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

      await controller.findAll(undefined, '100', undefined)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith(1, 100, undefined)
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
        await controller.findAll(undefined, undefined, status)
        expect(mockNotificationService.findAll).toHaveBeenCalledWith(1, 10, status)
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

      const result = await controller.findAll(undefined, undefined, undefined)

      expect(result.data[0]).toEqual(mockNotification)
      expect(result.data[0].id).toBe('unique-id')
      expect(result.data[0].status).toBe(NotificationStatus.COMPLETED)
    })
  })
})
