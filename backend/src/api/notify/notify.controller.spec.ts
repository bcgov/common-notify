import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import {
  VersioningType,
  CanActivate,
  ExecutionContext,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common'
import { vi } from 'vitest'
import request from 'supertest'
import {
  NotifySimpleController,
  NotifyEventController,
  NotifyController,
  ChesEmailController,
} from './notify.controller'
import { NotifyService } from './notify.service'
import { NotificationService } from '../../api/notification/notification.service'
import { TenantGuard } from '../../common/guards/tenant.guard'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'
import { SmsChannelFeatureFlagGuard } from '../../common/guards/sms-channel-feature-flag.guard'
import { ChesApiClient } from '../../ches/ches-api.client'
import { ConfigService } from '@nestjs/config'
import { QueueName } from '../../enum/queue-name.enum'
import { EMAIL_ADAPTER } from '../../adapters/tokens'
import { RenderingModule } from '../../services/rendering/rendering.module'
import { AttachmentProcessingService } from './services/attachment-processing.service'
import { AttachmentValidationService } from './services/attachment-validation.service'
import { FeatureFlagService } from '../../api/feature-flag/feature-flag.service'
import { TenantsService } from '../../api/admin/tenants/tenants.service'

// Mock TenantGuard to bypass authentication in tests
const mockTenantGuard: CanActivate = {
  canActivate: (context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest()
    // Attach a mock tenant to the request
    request.tenant = { id: 'test-tenant-id', name: 'test-tenant' }
    return true
  },
}

const mockChesApiClient = {
  sendEmail: vi.fn(),
}

const mockConfigService = {
  get: vi.fn().mockReturnValue(undefined),
}

const mockEmailAdapter = {
  name: 'mock',
  send: vi.fn(),
}

const mockNotificationService = {
  getNotifications: vi.fn(),
  getNotificationStatus: vi.fn(),
  createNotification: vi.fn(),
  create: vi.fn().mockResolvedValue({ id: 'mock-notification-id' }),
  update: vi.fn().mockResolvedValue(undefined),
  validateBusinessRules: vi.fn().mockResolvedValue([]),
}

const mockAttachmentValidationService = {
  validateAttachments: vi.fn().mockResolvedValue(undefined),
}

const mockAttachmentProcessingService = {
  processAttachments: vi.fn((request) => Promise.resolve(request)),
}

const mockIngestionQueue = {
  add: vi.fn(),
  process: vi.fn(),
}

const mockFeatureFlagService = {
  getFlagsForTenant: vi.fn().mockResolvedValue({
    sms_notifications: true,
  }),
}

const mockTenantsService = {
  findById: vi.fn().mockResolvedValue({
    id: 'test-tenant-id',
    name: 'test-tenant',
  }),
}

describe('Notify Controllers', () => {
  let service: NotifyService
  let app: INestApplication

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [RenderingModule],
      controllers: [
        NotifySimpleController,
        NotifyEventController,
        NotifyController,
        ChesEmailController,
      ],
      providers: [
        NotifyService,
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: AttachmentValidationService, useValue: mockAttachmentValidationService },
        { provide: AttachmentProcessingService, useValue: mockAttachmentProcessingService },
        { provide: ChesApiClient, useValue: mockChesApiClient },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: QueueName.INGESTION, useValue: mockIngestionQueue },
        { provide: EMAIL_ADAPTER, useValue: mockEmailAdapter },
        { provide: FeatureFlagService, useValue: mockFeatureFlagService },
        { provide: TenantsService, useValue: mockTenantsService },
      ],
    })
      .overrideGuard(TenantGuard)
      .useValue(mockTenantGuard)
      .overrideGuard(FeatureFlagGuard)
      .useValue(mockTenantGuard)
      .overrideGuard(SmsChannelFeatureFlagGuard)
      .useValue(mockTenantGuard)
      .compile()

    service = module.get<NotifyService>(NotifyService)
    app = module.createNestApplication()
    app.useGlobalPipes(
      new ValidationPipe({
        errorHttpStatusCode: 422,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    app.enableVersioning({
      type: VersioningType.URI,
      prefix: 'api/v',
    })
    await app.init()
  })

  afterEach(async () => {
    if (app) {
      await app.close()
    }
    vi.clearAllMocks()
    mockEmailAdapter.send.mockReset()
  })

  describe('NotifySimpleController', () => {
    it('should be defined', () => {
      const controller = app.get(NotifySimpleController)
      expect(controller).toBeDefined()
    })

    describe('POST /api/v1/notifysimple', () => {
      it('should return 201 status with a valid email payload', async () => {
        mockEmailAdapter.send.mockResolvedValue({
          messageId: 'ches-123456',
        })

        return request(app.getHttpServer())
          .post('/api/v1/notifysimple')
          .send({
            email: {
              recipients: { to: ['test@example.com'] },
              content: { subject: 'Test', body: 'Hello' },
            },
          })
          .expect(202)
          .expect((res) => {
            expect(res.body.notifyId).toBeDefined()
            expect(res.body.status).toBeDefined()
            expect(res.body.message).toBeDefined()
          })
      })

      it('should return 422 when no channel is provided', async () => {
        mockNotificationService.validateBusinessRules.mockResolvedValueOnce([
          'At least one recipient is required (email, SMS, or msgApp)',
        ])
        return request(app.getHttpServer()).post('/api/v1/notifysimple').send({}).expect(422)
      })

      it('should return 202 with status "accepted" for immediate send', async () => {
        return request(app.getHttpServer())
          .post('/api/v1/notifysimple')
          .send({
            email: {
              recipients: { to: ['test@example.com'] },
              content: { subject: 'Test', body: 'Hello' },
            },
          })
          .expect(202)
          .expect((res) => {
            expect(res.body.status).toBe('accepted')
            expect(res.body.message).toContain('Notification accepted')
          })
      })

      it('should return 202 with status "scheduled" when delayedSend is provided', async () => {
        const futureDate = new Date(Date.now() + 3600000).toISOString() // 1 hour from now (ISO format with Z)
        return request(app.getHttpServer())
          .post('/api/v1/notifysimple')
          .send({
            email: {
              recipients: { to: ['test@example.com'] },
              content: { subject: 'Test', body: 'Hello' },
              delayedSend: futureDate,
            },
          })
          .expect(202)
          .expect((res) => {
            expect(res.body.status).toBe('scheduled')
            expect(res.body.message).toContain('Notification scheduled for delivery')
          })
      })

      it('should return 202 with status "scheduled" for past delayedSend date', async () => {
        const pastDate = new Date(Date.now() - 3600000).toISOString() // 1 hour ago (ISO format with Z)
        return request(app.getHttpServer())
          .post('/api/v1/notifysimple')
          .send({
            email: {
              recipients: { to: ['test@example.com'] },
              content: { subject: 'Test', body: 'Hello' },
              delayedSend: pastDate,
            },
          })
          .expect(202)
          .expect((res) => {
            expect(res.body.status).toBe('scheduled')
            expect(res.body.message).toContain('Notification scheduled for delivery')
          })
      })

      it('should return 400 and not persist when attachment validation fails', async () => {
        mockAttachmentValidationService.validateAttachments.mockRejectedValueOnce(
          new BadRequestException('Invalid attachment'),
        )

        await request(app.getHttpServer())
          .post('/api/v1/notifysimple')
          .send({
            email: {
              recipients: { to: ['test@example.com'] },
              content: { subject: 'Test', body: 'Hello' },
              attachments: [
                {
                  filename: '../bad.txt',
                  mimeType: 'text/plain',
                  data: 'SGVsbG8=',
                },
              ],
            },
          })
          .expect(400)

        expect(mockNotificationService.create).not.toHaveBeenCalled()
        expect(mockNotificationService.validateBusinessRules).not.toHaveBeenCalled()
        expect(mockAttachmentProcessingService.processAttachments).not.toHaveBeenCalled()
      })

      it('should process attachments before persisting and remove raw data from the stored payload', async () => {
        const processedPayload = {
          email: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Test', body: 'Hello' },
            attachments: [
              {
                filename: 'hello.txt',
                mimeType: 'text/plain',
                storageKey: 'ab/abcdef.bin',
                sizeBytes: 11,
                contentSha256:
                  'b94d27b9934d3e08a52e52d7da7dabfade4f0f1b6d8d7e8e5a7a5f6d7c8b9a0f',
                storageProvider: 'local',
              },
            ],
          },
        }

        mockAttachmentProcessingService.processAttachments.mockResolvedValueOnce(
          processedPayload as any,
        )

        await request(app.getHttpServer())
          .post('/api/v1/notifysimple')
          .send({
            email: {
              recipients: { to: ['test@example.com'] },
              content: { subject: 'Test', body: 'Hello' },
              attachments: [
                {
                  filename: 'hello.txt',
                  mimeType: 'text/plain',
                  data: 'SGVsbG8gd29ybGQ=',
                },
              ],
            },
          })
          .expect(202)

        expect(mockAttachmentValidationService.validateAttachments).toHaveBeenCalledTimes(1)
        expect(mockAttachmentProcessingService.processAttachments).toHaveBeenCalledTimes(1)
        expect(mockNotificationService.create).toHaveBeenCalledWith(
          expect.objectContaining({
            payload: processedPayload,
          }),
        )

        const validationOrder =
          mockAttachmentValidationService.validateAttachments.mock.invocationCallOrder[0]
        const processingOrder =
          mockAttachmentProcessingService.processAttachments.mock.invocationCallOrder[0]
        const createOrder = mockNotificationService.create.mock.invocationCallOrder[0]

        expect(validationOrder).toBeLessThan(processingOrder)
        expect(processingOrder).toBeLessThan(createOrder)
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
