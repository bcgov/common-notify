import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { VersioningType, CanActivate, ExecutionContext } from '@nestjs/common'
import request from 'supertest'
import { NotificationController } from './notification.controller'
import { NotificationService } from './notification.service'
import { AuthJwtGuard } from '../auth/guards/auth.jwt-guard'
import { NotificationStatus } from './schemas'

// Mock AuthJwtGuard to bypass authentication and populate request.tenant
const mockAuthGuard: CanActivate = {
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest()
    req.tenant = { id: 'test-tenant-id' }
    return true
  },
}

const mockNotificationService = {
  findAll: vi.fn(),
  findOne: vi.fn(),
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

  describe('GET /api/v1/notifications', () => {
    it('should return 200 with a list of notifications', async () => {
      const mockNotifications = [
        { id: 'notif-1', tenantId: 'test-tenant-id', status: NotificationStatus.QUEUED },
        { id: 'notif-2', tenantId: 'test-tenant-id', status: NotificationStatus.COMPLETED },
      ]
      mockNotificationService.findAll.mockResolvedValue(mockNotifications)

      return request(app.getHttpServer())
        .get('/api/v1/notifications')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveLength(2)
          expect(res.body[0].id).toBe('notif-1')
        })
    })

    it('should return empty array when no notifications exist', async () => {
      mockNotificationService.findAll.mockResolvedValue([])

      return request(app.getHttpServer())
        .get('/api/v1/notifications')
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual([])
        })
    })

    it('should call findAll with no arguments', async () => {
      mockNotificationService.findAll.mockResolvedValue([])

      await request(app.getHttpServer()).get('/api/v1/notifications').expect(200)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith()
    })
  })

  describe('GET /api/v1/notifications/:id', () => {
    it('should return 200 with a notification by id', async () => {
      const notifId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      const mockNotification = {
        id: notifId,
        tenantId: 'test-tenant-id',
        status: NotificationStatus.QUEUED,
      }
      mockNotificationService.findOne.mockResolvedValue(mockNotification)

      return request(app.getHttpServer())
        .get(`/api/v1/notifications/${notifId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(notifId)
        })
    })

    it('should return 400 for an invalid UUID', async () => {
      return request(app.getHttpServer()).get('/api/v1/notifications/not-a-uuid').expect(400)
    })

    it('should call findOne with the id and tenantId', async () => {
      const notifId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      mockNotificationService.findOne.mockResolvedValue({ id: notifId })

      await request(app.getHttpServer()).get(`/api/v1/notifications/${notifId}`).expect(200)

      expect(mockNotificationService.findOne).toHaveBeenCalledWith(notifId, 'test-tenant-id')
    })
  })

  describe('NotificationService integration', () => {
    it('should call findAll on NotificationService when listing notifications', async () => {
      const spyFindAll = vi.spyOn(service, 'findAll')
      mockNotificationService.findAll.mockResolvedValue([])

      await request(app.getHttpServer()).get('/api/v1/notifications').expect(200)

      expect(spyFindAll).toHaveBeenCalledTimes(1)
    })

    it('should call findOne on NotificationService with id and tenantId', async () => {
      const notifId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      const spyFindOne = vi.spyOn(service, 'findOne')
      mockNotificationService.findOne.mockResolvedValue({ id: notifId })

      await request(app.getHttpServer()).get(`/api/v1/notifications/${notifId}`).expect(200)

      expect(spyFindOne).toHaveBeenCalledTimes(1)
    })
  })
})
