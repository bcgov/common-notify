import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { VersioningType, CanActivate, ExecutionContext } from '@nestjs/common'
import request from 'supertest'
import { NotificationController } from './notification.controller'
import { NotificationService } from './notification.service'
import { AuthJwtGuard } from '../auth/guards/auth.jwt-guard'
import { RoleGuard } from '../common/guards/role.guard'

// Mock AuthJwtGuard to bypass authentication and populate request.tenant
const mockAuthGuard: CanActivate = {
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest()
    req.tenant = { id: 'test-tenant-id' }
    return true
  },
}

// Mock RoleGuard to bypass role checking
const mockRoleGuard: CanActivate = {
  canActivate: () => true,
}

const mockNotificationService = {
  findAll: vi.fn(),
}

describe('NotificationController', () => {
  let service: NotificationService
  let app: INestApplication

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [{ provide: NotificationService, useValue: mockNotificationService }],
    })
      .overrideGuard(AuthJwtGuard)
      .useValue(mockAuthGuard)
      .overrideGuard(RoleGuard)
      .useValue(mockRoleGuard)
      .compile()

    service = module.get<NotificationService>(NotificationService)
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
    const controller = app.get(NotificationController)
    expect(controller).toBeDefined()
  })

  describe('GET /api/v1/notification_request', () => {
    it('should return 200 with a paginated list of notifications', async () => {
      const mockNotifications = {
        data: [
          { id: 'notif-1', tenantId: 'test-tenant-id', status: 'queued' },
          { id: 'notif-2', tenantId: 'test-tenant-id', status: 'completed' },
        ],
        count: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      }
      mockNotificationService.findAll.mockResolvedValue(mockNotifications)

      return request(app.getHttpServer())
        .get('/api/v1/notification_request')
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toHaveLength(2)
          expect(res.body.count).toBe(2)
          expect(res.body.page).toBe(1)
          expect(res.body.data[0].id).toBe('notif-1')
        })
    })

    it('should return empty data array when no notifications exist', async () => {
      const mockNotifications = {
        data: [],
        count: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      }
      mockNotificationService.findAll.mockResolvedValue(mockNotifications)

      return request(app.getHttpServer())
        .get('/api/v1/notification_request')
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toEqual([])
          expect(res.body.count).toBe(0)
        })
    })

    it('should call findAll with page and limit parameters', async () => {
      const mockNotifications = {
        data: [],
        count: 0,
        page: 2,
        limit: 20,
        totalPages: 0,
      }
      mockNotificationService.findAll.mockResolvedValue(mockNotifications)

      await request(app.getHttpServer())
        .get('/api/v1/notification_request?page=2&limit=20')
        .expect(200)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith(2, 20, undefined)
    })

    it('should call findAll with status filter parameter', async () => {
      const mockNotifications = {
        data: [],
        count: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      }
      mockNotificationService.findAll.mockResolvedValue(mockNotifications)

      await request(app.getHttpServer())
        .get('/api/v1/notification_request?status=completed')
        .expect(200)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith(1, 10, 'completed')
    })
  })

  describe('NotificationService integration', () => {
    it('should call findAll on NotificationService when listing notifications', async () => {
      const spyFindAll = vi.spyOn(service, 'findAll')
      const mockNotifications = {
        data: [],
        count: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      }
      mockNotificationService.findAll.mockResolvedValue(mockNotifications)

      await request(app.getHttpServer()).get('/api/v1/notification_request').expect(200)

      expect(spyFindAll).toHaveBeenCalledTimes(1)
    })
  })
})
