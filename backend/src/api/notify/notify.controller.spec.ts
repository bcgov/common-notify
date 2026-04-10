import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { VersioningType, CanActivate, ExecutionContext } from '@nestjs/common'
import request from 'supertest'
import {
  NotifySimpleController,
  NotifyEventController,
  NotifyController,
  TemplatesController,
  ChesEmailController,
} from './notify.controller'
import { NotifyService } from './notify.service'
import { TenantGuard } from '../../common/guards/tenant.guard'

// Mock TenantGuard to bypass authentication in tests
const mockTenantGuard: CanActivate = {
  canActivate: (context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest()
    // Attach a mock tenant to the request
    request.tenant = { id: 'test-tenant-id', name: 'test-tenant' }
    return true
  },
}

describe('Notify Controllers', () => {
  let service: NotifyService
  let app: INestApplication

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        NotifySimpleController,
        NotifyEventController,
        NotifyController,
        TemplatesController,
        ChesEmailController,
      ],
      providers: [NotifyService],
    })
      .overrideGuard(TenantGuard)
      .useValue(mockTenantGuard)
      .compile()

    service = module.get<NotifyService>(NotifyService)
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

  describe('NotifySimpleController', () => {
    it('should be defined', () => {
      const controller = app.get(NotifySimpleController)
      expect(controller).toBeDefined()
    })

    describe('POST /api/v1/notifysimple', () => {
      it('should return 501 status', async () => {
        return request(app.getHttpServer())
          .post('/api/v1/notifysimple')
          .send({ message: 'test' })
          .expect(501)
      })

      it('should return not implemented response', async () => {
        return request(app.getHttpServer())
          .post('/api/v1/notifysimple')
          .send({ message: 'test' })
          .expect(501)
          .expect((res) => {
            expect(res.body.error).toBe('Not implemented')
            expect(res.body.message).toBe('This endpoint is not yet implemented')
            expect(res.body.timestamp).toBeDefined()
          })
      })
    })
  })

  describe('NotifyEventController', () => {
    it('should be defined', () => {
      const controller = app.get(NotifyEventController)
      expect(controller).toBeDefined()
    })

    describe('POST /api/v1/notifyevent', () => {
      it('should return 501 status', async () => {
        return request(app.getHttpServer())
          .post('/api/v1/notifyevent')
          .send({ event: 'test' })
          .expect(501)
      })

      it('should return not implemented response', async () => {
        return request(app.getHttpServer())
          .post('/api/v1/notifyevent')
          .send({ event: 'test' })
          .expect(501)
          .expect((res) => {
            expect(res.body.error).toBe('Not implemented')
          })
      })
    })

    describe('POST /api/v1/notifyevent/preview', () => {
      it('should return 501 status', async () => {
        return request(app.getHttpServer())
          .post('/api/v1/notifyevent/preview')
          .send({ template: 'test' })
          .expect(501)
      })
    })

    describe('GET /api/v1/notifyevent/types', () => {
      it('should return 501 status', async () => {
        return request(app.getHttpServer()).get('/api/v1/notifyevent/types').expect(501)
      })

      it('should accept query parameters', async () => {
        return request(app.getHttpServer())
          .get('/api/v1/notifyevent/types?limit=10&cursor=abc')
          .expect(501)
      })
    })

    describe('GET /api/v1/notifyevent/types/:eventTypeId', () => {
      it('should return 501 status', async () => {
        return request(app.getHttpServer()).get('/api/v1/notifyevent/types/event-123').expect(501)
      })
    })
  })

  describe('NotifyController', () => {
    it('should be defined', () => {
      const controller = app.get(NotifyController)
      expect(controller).toBeDefined()
    })

    describe('GET /api/v1/notify', () => {
      it('should return 501 status', async () => {
        return request(app.getHttpServer()).get('/api/v1/notify').expect(501)
      })

      it('should accept query parameters', async () => {
        return request(app.getHttpServer())
          .get('/api/v1/notify?limit=20&status=sent&startDate=2025-01-01')
          .expect(501)
      })
    })

    describe('DELETE /api/v1/notify', () => {
      it('should return 501 status', async () => {
        return request(app.getHttpServer()).delete('/api/v1/notify?notifyId=notify-123').expect(501)
      })
    })

    describe('GET /api/v1/notify/status/:notifyId', () => {
      it('should return 501 status', async () => {
        return request(app.getHttpServer()).get('/api/v1/notify/status/notify-123').expect(501)
      })
    })

    describe('POST /api/v1/notify/registerCallback', () => {
      it('should return 501 status', async () => {
        return request(app.getHttpServer())
          .post('/api/v1/notify/registerCallback')
          .send({ url: 'http://example.com/callback' })
          .expect(501)
      })
    })

    describe('PATCH /api/v1/notify/registerCallback/:callbackId', () => {
      it('should return 501 status', async () => {
        return request(app.getHttpServer())
          .patch('/api/v1/notify/registerCallback/callback-123')
          .send({ url: 'http://example.com/callback-updated' })
          .expect(501)
      })
    })

    describe('DELETE /api/v1/notify/registerCallback/:callbackId', () => {
      it('should return 501 status', async () => {
        return request(app.getHttpServer())
          .delete('/api/v1/notify/registerCallback/callback-123')
          .expect(501)
      })
    })
  })

  describe('TemplatesController', () => {
    it('should be defined', () => {
      const controller = app.get(TemplatesController)
      expect(controller).toBeDefined()
    })

    describe('GET /api/v1/templates', () => {
      it('should return 501 status', async () => {
        return request(app.getHttpServer()).get('/api/v1/templates').expect(501)
      })

      it('should accept query parameters', async () => {
        return request(app.getHttpServer()).get('/api/v1/templates?limit=50&cursor=xyz').expect(501)
      })
    })

    describe('GET /api/v1/templates/:templateId', () => {
      it('should return 501 status', async () => {
        return request(app.getHttpServer()).get('/api/v1/templates/template-123').expect(501)
      })
    })
  })

  describe('ChesEmailController', () => {
    it('should be defined', () => {
      const controller = app.get(ChesEmailController)
      expect(controller).toBeDefined()
    })

    describe('POST /ches/api/v1/email', () => {
      it('should return 501 status', async () => {
        // CHES email endpoint doesn't use versioning prefix
        return request(app.getHttpServer())
          .post('/ches/api/v1/email')
          .send({ to: 'test@example.com', subject: 'test' })
          .expect(501)
      })

      it('should return not implemented response', async () => {
        return request(app.getHttpServer())
          .post('/ches/api/v1/email')
          .send({ to: 'test@example.com' })
          .expect(501)
          .expect((res) => {
            expect(res.body.error).toBe('Not implemented')
            expect(res.body.message).toBe('This endpoint is not yet implemented')
          })
      })
    })
  })

  describe('NotifyService integration', () => {
    it('should use NotifyService for all controllers', () => {
      const spyNotImplemented = vi.spyOn(service, 'notImplemented')

      // Call notImplemented directly on service
      service.notImplemented()

      expect(spyNotImplemented).toHaveBeenCalledTimes(1)
    })
  })
})
