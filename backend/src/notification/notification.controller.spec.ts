import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { VersioningType, CanActivate, ExecutionContext } from '@nestjs/common'
import request from 'supertest'
import { NotificationController } from './notification.controller'
import { NotificationService } from './notification.service'
import { AuthJwtGuard } from '../auth/guards/auth.jwt-guard'

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

  describe('GET /api/v1/notification_request', () => {
    it('should return 200 with a list of notifications', async () => {
      const mockNotifications = [
        { id: 'notif-1', tenantId: 'test-tenant-id', status: NotificationStatus.QUEUED },
        { id: 'notif-2', tenantId: 'test-tenant-id', status: NotificationStatus.COMPLETED },
      ]
      mockNotificationService.findAll.mockResolvedValue(mockNotifications)

      return request(app.getHttpServer())
        .get('/api/v1/notification_request')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveLength(2)
          expect(res.body[0].id).toBe('notif-1')
        })
    })

    it('should return empty array when no notifications exist', async () => {
      mockNotificationService.findAll.mockResolvedValue([])

      return request(app.getHttpServer())
        .get('/api/v1/notification_request')
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual([])
        })
    })

    it('should call findAll with no arguments', async () => {
      mockNotificationService.findAll.mockResolvedValue([])

      await request(app.getHttpServer()).get('/api/v1/notification_request').expect(200)

      expect(mockNotificationService.findAll).toHaveBeenCalledWith()
    })
  })

  describe('NotificationService integration', () => {
    it('should call findAll on NotificationService when listing notifications', async () => {
      const spyFindAll = vi.spyOn(service, 'findAll')
      mockNotificationService.findAll.mockResolvedValue([])

      await request(app.getHttpServer()).get('/api/v1/notification_request').expect(200)

      expect(spyFindAll).toHaveBeenCalledTimes(1)
    })
  })
})
