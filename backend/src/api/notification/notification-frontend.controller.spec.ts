import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import type { INestApplication, CanActivate, ExecutionContext } from '@nestjs/common'
import { VersioningType } from '@nestjs/common'
import request from 'supertest'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NotificationFrontendController } from './notification-frontend.controller'
import { NotificationService } from './notification.service'
import { NotificationPubSubService } from './notification-pubsub.service'
import { NotificationRequestDetailService } from './notification-request-detail.service'
import { NotificationStatus } from './schemas/create-notification-request'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'

// Mock guard to bypass authentication and populate request.tenant, mirroring what
// NotifyFrontendRoleGuard does after validating the x-tenant-id header against CSTAR.
const mockAuthGuard: CanActivate = {
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest()
    req.tenant = {
      id: 'test-tenant-id',
      externalId: 'cstar-tenant-external-id',
      name: 'Test Tenant',
      slug: 'test-tenant',
    }
    return true
  },
}

const mockNotificationService = {
  findAll: vi.fn(),
}

const mockNotificationRequestDetailService = {
  findAllByTenantId: vi.fn(),
  findByRequestId: vi.fn(),
}

const mockNotificationPubSubService = {
  getObservable: vi.fn(),
}

describe('NotificationFrontendController', () => {
  let app: INestApplication

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationFrontendController],
      providers: [
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
        {
          provide: NotificationRequestDetailService,
          useValue: mockNotificationRequestDetailService,
        },
        {
          provide: NotificationPubSubService,
          useValue: mockNotificationPubSubService,
        },
      ],
    })
      .overrideGuard(NotifyFrontendRoleGuard)
      .useValue(mockAuthGuard)
      .overrideGuard(FeatureFlagGuard)
      .useValue({ canActivate: () => true })
      .compile()

    app = module.createNestApplication()
    app.enableVersioning({
      type: VersioningType.URI,
      prefix: 'api/v',
    })
    await app.init()
  })

  afterEach(async () => {
    await app.close()
    vi.clearAllMocks()
  })

  it('should be defined', () => {
    const controller = app.get(NotificationFrontendController)
    expect(controller).toBeDefined()
  })

  describe('GET /api/v1/frontend/notification_request', () => {
    it('should delegate to notificationService.findAll using the tenant from the request context', async () => {
      const mockResponse = { data: [], count: 0, page: 1, limit: 10, totalPages: 0 }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      await request(app.getHttpServer()).get('/api/v1/frontend/notification_request').expect(200)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith(
        'cstar-tenant-external-id',
        expect.objectContaining({}),
      )
    })

    it('should ignore a client-supplied tenantId query parameter and use the authenticated tenant instead', async () => {
      const mockResponse = { data: [], count: 0, page: 1, limit: 10, totalPages: 0 }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      await request(app.getHttpServer())
        .get('/api/v1/frontend/notification_request?tenantId=some-other-tenant')
        .expect(200)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith(
        'cstar-tenant-external-id',
        expect.objectContaining({}),
      )
    })

    it('should forward list query parameters to the service', async () => {
      const mockResponse = { data: [], count: 0, page: 2, limit: 20, totalPages: 0 }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      await request(app.getHttpServer())
        .get(
          '/api/v1/frontend/notification_request?page=2&limit=20&sort=-createdAt,status&filter=status:eq:QUEUED&filter=channelCode:in:EMAIL|SMS',
        )
        .expect(200)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith(
        'cstar-tenant-external-id',
        expect.objectContaining({
          page: '2',
          limit: '20',
          sort: '-createdAt,status',
          filter: ['status:eq:QUEUED', 'channelCode:in:EMAIL|SMS'],
        }),
      )
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

      const res = await request(app.getHttpServer())
        .get('/api/v1/frontend/notification_request')
        .expect(200)

      expect(res.body.data).toEqual(mockNotifications)
      expect(res.body.count).toBe(25)
      expect(res.body.totalPages).toBe(3)
    })

    it('should return empty data array when no notifications exist', async () => {
      const mockResponse = { data: [], count: 0, page: 1, limit: 10, totalPages: 0 }
      mockNotificationService.findAll.mockResolvedValue(mockResponse)

      const res = await request(app.getHttpServer())
        .get('/api/v1/frontend/notification_request')
        .expect(200)

      expect(res.body.data).toEqual([])
      expect(res.body.count).toBe(0)
    })

    it('should propagate service errors as a 500 response', async () => {
      mockNotificationService.findAll.mockRejectedValue(new Error('Database error'))

      await request(app.getHttpServer()).get('/api/v1/frontend/notification_request').expect(500)
    })
  })
})
