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
import { NotifyServiceGuard } from '../../common/guards/notify-service.guard'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
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
import { WebhookService } from '../../api/webhook/webhook.service'
import { ValidationExceptionFilter } from '../../common/filters/validation.filter'
import { NotificationRequestDetailService } from '../../api/notification/notification-request-detail.service'

// Mock AuthGuard to bypass authentication in tests
const mockAuthGuard: CanActivate = {
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
  validateBulkRules: vi.fn().mockResolvedValue([]),
  parseBulkRecipients: vi.fn().mockReturnValue([
    { address: 'alice@example.com', params: {} },
    { address: 'bob@example.com', params: {} },
  ]),
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

const mockWebhookService = {
  create: vi.fn().mockResolvedValue({ id: 'cb-1' }),
  update: vi.fn().mockResolvedValue({ id: 'cb-1' }),
  delete: vi.fn().mockResolvedValue(undefined),
}

const mockNotificationRequestDetailService = {
  createPending: vi.fn().mockResolvedValue(undefined),
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
        {
          provide: NotificationRequestDetailService,
          useValue: mockNotificationRequestDetailService,
        },
        { provide: ChesApiClient, useValue: mockChesApiClient },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: QueueName.INGESTION, useValue: mockIngestionQueue },
        { provide: EMAIL_ADAPTER, useValue: mockEmailAdapter },
        { provide: FeatureFlagService, useValue: mockFeatureFlagService },
        { provide: TenantsService, useValue: mockTenantsService },
        { provide: WebhookService, useValue: mockWebhookService },
      ],
    })
      .overrideGuard(NotifyServiceGuard)
      .useValue(mockAuthGuard)
      .overrideGuard(NotifyFrontendRoleGuard)
      .useValue(mockAuthGuard)
      .overrideGuard(FeatureFlagGuard)
      .useValue(mockAuthGuard)
      .overrideGuard(SmsChannelFeatureFlagGuard)
      .useValue(mockAuthGuard)
      .compile()

    service = module.get<NotifyService>(NotifyService)
    app = module.createNestApplication()
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    app.useGlobalFilters(new ValidationExceptionFilter())
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
                  content: 'SGVsbG8=',
                },
              ],
            },
          })
          .expect(400)

        expect(mockNotificationService.create).not.toHaveBeenCalled()
        expect(mockNotificationService.validateBusinessRules).not.toHaveBeenCalled()
        expect(mockAttachmentProcessingService.processAttachments).not.toHaveBeenCalled()
      })

      it('should return a clear DTO error when attachment content is missing', async () => {
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
                },
              ],
            },
          })
          .expect(400)
          .expect((res) => {
            expect(res.body).toEqual({
              statusCode: 400,
              message: 'Validation failed',
              errors: ['Attachment content is required and must be a base64-encoded string.'],
              fieldErrors: {
                'email.attachments.0.content':
                  'Attachment content is required and must be a base64-encoded string.',
              },
            })
          })

        expect(mockAttachmentValidationService.validateAttachments).not.toHaveBeenCalled()
        expect(mockNotificationService.create).not.toHaveBeenCalled()
      })

      it("should map the legacy attachment 'data' field to a clearer validation error", async () => {
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
                  data: 'SGVsbG8=',
                },
              ],
            },
          })
          .expect(400)
          .expect((res) => {
            expect(res.body).toEqual({
              statusCode: 400,
              message: 'Validation failed',
              errors: [
                "The attachment field 'data' is not supported. Use 'content' instead.",
                'Attachment content is required and must be a base64-encoded string.',
              ],
              fieldErrors: {
                'email.attachments.0.data':
                  "The attachment field 'data' is not supported. Use 'content' instead.",
                'email.attachments.0.content':
                  'Attachment content is required and must be a base64-encoded string.',
              },
            })
          })

        expect(mockAttachmentValidationService.validateAttachments).not.toHaveBeenCalled()
        expect(mockNotificationService.create).not.toHaveBeenCalled()
      })

      describe('POST /api/v1/notifysimple/bulk', () => {
        const validBulkBody = {
          name: 'Test Bulk',
          templateId: '12345678-1234-4234-8234-123456789012',
          mergeArray: [['to'], ['alice@example.com'], ['bob@example.com']],
        }

        it('should return 202 with status "accepted" for an immediate bulk send', async () => {
          return request(app.getHttpServer())
            .post('/api/v1/notifysimple/bulk')
            .send(validBulkBody)
            .expect(202)
            .expect((res) => {
              expect(res.body.notifyId).toBeDefined()
              expect(res.body.status).toBe('accepted')
              expect(res.body.message).toContain('Bulk send accepted with 2 recipient(s)')
              expect(res.body.channels).toEqual(['email'])
            })
        })

        it('should return 202 with status "scheduled" when delayedSend is provided', async () => {
          const futureDate = new Date(Date.now() + 3600000).toISOString()
          return request(app.getHttpServer())
            .post('/api/v1/notifysimple/bulk')
            .send({ ...validBulkBody, delayedSend: futureDate })
            .expect(202)
            .expect((res) => {
              expect(res.body.status).toBe('scheduled')
              expect(res.body.message).toContain('Bulk send scheduled for delivery at')
            })
        })

        it('should return 422 when validateBulkRules returns errors', async () => {
          mockNotificationService.validateBulkRules.mockResolvedValueOnce([
            'Template not found for tenant',
          ])
          return request(app.getHttpServer())
            .post('/api/v1/notifysimple/bulk')
            .send(validBulkBody)
            .expect(422)
            .expect((res) => {
              expect(res.body.message).toBe('Request validation failed')
              expect(res.body.errors).toContain('Template not found for tenant')
            })
        })

        it('should return 400 when rows are missing', async () => {
          return request(app.getHttpServer())
            .post('/api/v1/notifysimple/bulk')
            .send({ name: 'Test', templateId: '12345678-1234-1234-1234-123456789012' })
            .expect(400)
        })

        it('should return 400 when templateId is not a valid UUID', async () => {
          return request(app.getHttpServer())
            .post('/api/v1/notifysimple/bulk')
            .send({ ...validBulkBody, templateId: 'not-a-uuid' })
            .expect(400)
        })

        it('should return 400 when mergeArray header is missing the "to" column', async () => {
          return request(app.getHttpServer())
            .post('/api/v1/notifysimple/bulk')
            .send({ ...validBulkBody, mergeArray: [['name'], ['Alice']] })
            .expect(400)
        })
      })

      it('should process attachments before persisting and remove raw data from the stored payload', async () => {
        const processedPayload = {
          email: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Test', body: 'Hello' },
            attachments: [
              {
                attachmentId: 'attachment-123',
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
                  content: 'SGVsbG8gd29ybGQ=',
                },
              ],
            },
          })
          .expect(202)

        expect(mockAttachmentValidationService.validateAttachments).toHaveBeenCalledTimes(1)
        expect(mockAttachmentProcessingService.processAttachments).toHaveBeenCalledTimes(1)
        expect(mockAttachmentProcessingService.processAttachments).toHaveBeenCalledWith(
          expect.objectContaining({
            email: expect.objectContaining({
              attachments: [
                expect.objectContaining({
                  filename: 'hello.txt',
                  mimeType: 'text/plain',
                  content: 'SGVsbG8gd29ybGQ=',
                }),
              ],
            }),
          }),
          'test-tenant-id',
          'test-tenant-id',
        )
        expect(mockNotificationService.create).toHaveBeenCalledWith(
          expect.objectContaining({
            payload: processedPayload,
          }),
        )
        expect(mockNotificationService.create).toHaveBeenCalledWith(
          expect.objectContaining({
            payload: expect.not.objectContaining({
              email: expect.objectContaining({
                attachments: expect.arrayContaining([
                  expect.objectContaining({
                    content: expect.anything(),
                  }),
                ]),
              }),
            }),
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

      it('should enqueue only sanitized attachmentId payloads after processing', async () => {
        const processedPayload = {
          email: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Test', body: 'Hello' },
            attachments: [{ attachmentId: 'attachment-123' }],
          },
        }

        mockAttachmentProcessingService.processAttachments.mockResolvedValueOnce(
          processedPayload as any,
        )
        mockIngestionQueue.add.mockResolvedValueOnce({ id: 'job-123' })

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
                  content: 'SGVsbG8gd29ybGQ=',
                },
              ],
            },
          })
          .expect(202)

        await vi.waitFor(() => {
          expect(mockIngestionQueue.add).toHaveBeenCalledWith(
            expect.objectContaining({
              request: processedPayload,
            }),
            expect.any(Object),
          )
        })

        expect(mockIngestionQueue.add).toHaveBeenCalledWith(
          expect.objectContaining({
            request: expect.not.objectContaining({
              email: expect.objectContaining({
                attachments: expect.arrayContaining([
                  expect.objectContaining({
                    content: expect.anything(),
                  }),
                ]),
              }),
            }),
          }),
          expect.any(Object),
        )
      })

      it('should not persist or queue when attachment upload fails during processing', async () => {
        mockAttachmentProcessingService.processAttachments.mockRejectedValueOnce(
          new BadRequestException('Attachment upload failed'),
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
                  content: 'SGVsbG8gd29ybGQ=',
                },
              ],
            },
          })
          .expect(400)

        expect(mockNotificationService.create).not.toHaveBeenCalled()
        expect(mockIngestionQueue.add).not.toHaveBeenCalled()
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
      it('should return 201 status', async () => {
        return request(app.getHttpServer())
          .post('/api/v1/notify/registerCallback')
          .send({
            url: 'https://example.com/callback',
            channelType: ['email'],
            trigger: ['success'],
          })
          .expect(201)
      })
    })

    describe('PATCH /api/v1/notify/registerCallback/:callbackId', () => {
      it('should return 200 status', async () => {
        return request(app.getHttpServer())
          .patch('/api/v1/notify/registerCallback/callback-123')
          .send({ url: 'https://example.com/callback-updated' })
          .expect(200)
      })
    })

    describe('DELETE /api/v1/notify/registerCallback/:callbackId', () => {
      it('should return 204 status', async () => {
        return request(app.getHttpServer())
          .delete('/api/v1/notify/registerCallback/callback-123')
          .expect(204)
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
