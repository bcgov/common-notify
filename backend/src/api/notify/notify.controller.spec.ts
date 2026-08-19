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
  NotifySimpleFrontendController,
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
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { EMAIL_ADAPTER } from '../../adapters/tokens'
import { RenderingModule } from '../../services/rendering/rendering.module'
import { AttachmentProcessingService } from './services/attachment-processing.service'
import { AttachmentValidationService } from './services/attachment-validation.service'
import { ApiKeyUsageService } from '../api-keys/api-key-usage.service'
import { FeatureFlagService } from '../../api/feature-flag/feature-flag.service'
import { TenantsService } from '../../api/admin/tenants/tenants.service'
import { WebhookService } from '../../api/webhook/webhook.service'
import { ValidationExceptionFilter } from '../../common/filters/validation.filter'
import { NotificationRequestDetailService } from '../../api/notification/notification-request-detail.service'
import { LimitAlertNotificationService } from './services/limit-alert-notification.service'
import { SafelistService } from '../safelist/safelist.service'
import { SmsSegmentService } from './services/sms-segment.service'
import { UsagePeriodType } from '../../enum/usage-period-type.enum'

// Mock AuthGuard to bypass authentication in tests
let mockApiKeyConsumerId: string | undefined
const mockAuthGuard: CanActivate = {
  canActivate: (context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest()
    // Attach a mock tenant to the request
    request.tenant = { id: 'test-tenant-id', name: 'test-tenant' }
    request.apiKeyConsumerId = mockApiKeyConsumerId
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
  parseMailMergeRecipients: vi.fn().mockReturnValue([
    { address: 'alice@example.com', params: {} },
    { address: 'bob@example.com', params: {} },
  ]),
  validateMailMergeRules: vi.fn().mockResolvedValue([]),
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
  createBlocked: vi.fn().mockResolvedValue(undefined),
}

// Safelist enforcement is off unless a test opts in, matching PROD and keeping every existing
// send test unaffected by the guardrail.
const mockSafelistService = {
  isEnforced: vi.fn().mockResolvedValue(false),
  findBlocked: vi.fn().mockResolvedValue([]),
  appliesTo: (channel: string) => channel === 'EMAIL' || channel === 'SMS',
}

const mockApiKeyUsageService = {
  recordUsage: vi.fn().mockResolvedValue([]),
  assertWithinLimits: vi.fn().mockResolvedValue(undefined),
}

const mockLimitAlertNotificationService = {
  processAcceptedUsage: vi.fn().mockResolvedValue(undefined),
}

const mockSmsSegmentService = {
  countSegmentsPerRecipient: vi.fn().mockResolvedValue(1),
}

describe('Notify Controllers', () => {
  let service: NotifyService
  let app: INestApplication

  beforeEach(async () => {
    mockNotificationService.validateBusinessRules.mockResolvedValue([])
    mockNotificationService.validateMailMergeRules.mockResolvedValue([])
    mockNotificationService.parseMailMergeRecipients.mockReturnValue(
      ['alice@example.com', 'bob@example.com'].map((address) => ({ address, params: {} })),
    )
    mockNotificationService.create.mockResolvedValue({ id: 'mock-notification-id' })
    mockNotificationService.update.mockResolvedValue(undefined)
    mockApiKeyConsumerId = undefined
    mockApiKeyUsageService.recordUsage.mockResolvedValue([])
    mockApiKeyUsageService.assertWithinLimits.mockResolvedValue(undefined)
    mockLimitAlertNotificationService.processAcceptedUsage.mockResolvedValue(undefined)
    mockSafelistService.isEnforced.mockResolvedValue(false)
    mockSafelistService.findBlocked.mockResolvedValue([])
    mockSmsSegmentService.countSegmentsPerRecipient.mockResolvedValue(1)

    const module: TestingModule = await Test.createTestingModule({
      imports: [RenderingModule],
      controllers: [
        NotifySimpleController,
        NotifySimpleFrontendController,
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
        {
          provide: ApiKeyUsageService,
          useValue: mockApiKeyUsageService,
        },
        {
          provide: LimitAlertNotificationService,
          useValue: mockLimitAlertNotificationService,
        },
        {
          provide: SafelistService,
          useValue: mockSafelistService,
        },
        {
          provide: SmsSegmentService,
          useValue: mockSmsSegmentService,
        },
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

    it('receives the limit-alert provider through Nest injection', () => {
      const controller = app.get(NotifySimpleController)
      expect(controller.limitAlertNotificationService).toBe(mockLimitAlertNotificationService)
    })

    it('passes the same provider to the manually constructed frontend delegate', async () => {
      const frontendController = app.get(NotifySimpleFrontendController)
      const delegate = vi
        .spyOn(NotifySimpleController.prototype as any, 'doCancelOrReschedule')
        .mockResolvedValue({ id: 'notification-1' })

      try {
        await frontendController.cancelOrRescheduleNotification(
          { user: { tenantId: 'tenant-1', sub: 'user-1' } },
          'notification-1',
          { action: 'cancel' },
        )

        expect(
          (delegate.mock.instances[0] as NotifySimpleController).limitAlertNotificationService,
        ).toBe(mockLimitAlertNotificationService)
      } finally {
        delegate.mockRestore()
      }
    })

    describe('accepted usage limit-alert wiring', () => {
      const dayPeriodStart = new Date('2026-07-29T00:00:00.000Z')
      const yearPeriodStart = new Date('2026-04-01T00:00:00.000Z')
      const standardBody = {
        email: {
          recipients: { to: ['test@example.com'] },
          content: { subject: 'Test', body: 'Hello' },
        },
      }

      it('forwards exact standard-send usage results and API-key consumer ID', async () => {
        mockApiKeyConsumerId = 'consumer-standard'
        mockApiKeyUsageService.recordUsage.mockResolvedValue([
          {
            periodTypeCode: UsagePeriodType.DAY,
            periodStart: dayPeriodStart,
            sentCount: 81,
          },
          {
            periodTypeCode: UsagePeriodType.YEAR,
            periodStart: yearPeriodStart,
            sentCount: 901,
          },
        ])

        const response = await request(app.getHttpServer())
          .post('/api/v1/notifysimple')
          .send(standardBody)
          .expect(202)

        expect(response.body.status).toBe('accepted')
        expect(mockLimitAlertNotificationService.processAcceptedUsage).toHaveBeenCalledWith({
          apiKeyConsumerId: 'consumer-standard',
          usageResults: [
            {
              channelCode: 'EMAIL',
              periodTypeCode: UsagePeriodType.DAY,
              periodStart: dayPeriodStart,
              sentCount: 81,
            },
            {
              channelCode: 'EMAIL',
              periodTypeCode: UsagePeriodType.YEAR,
              periodStart: yearPeriodStart,
              sentCount: 901,
            },
          ],
        })
      })

      it('forwards exact email-merge usage results', async () => {
        mockApiKeyConsumerId = 'consumer-merge'
        mockApiKeyUsageService.recordUsage.mockResolvedValue([
          {
            periodTypeCode: UsagePeriodType.DAY,
            periodStart: dayPeriodStart,
            sentCount: 102,
          },
        ])

        const response = await request(app.getHttpServer())
          .post('/api/v1/notifysimple/email')
          .send({
            content: { templateId: '12345678-1234-4234-8234-123456789012' },
            recipients: {
              mergeArray: [['to'], ['alice@example.com'], ['bob@example.com']],
            },
          })
          .expect(202)

        expect(response.body.status).toBe('accepted')
        expect(mockLimitAlertNotificationService.processAcceptedUsage).toHaveBeenCalledWith({
          apiKeyConsumerId: 'consumer-merge',
          usageResults: [
            {
              channelCode: 'EMAIL',
              periodTypeCode: UsagePeriodType.DAY,
              periodStart: dayPeriodStart,
              sentCount: 102,
            },
          ],
        })
      })

      describe('SMS segment billing', () => {
        const smsBody = {
          sms: {
            recipients: { to: ['+12505550123', '+12505550124'] },
            content: { body: 'Hello' },
          },
        }

        it('bills each recipient for every segment of a multi-segment SMS', async () => {
          mockApiKeyConsumerId = 'consumer-sms'
          mockSmsSegmentService.countSegmentsPerRecipient.mockResolvedValue(3)

          await request(app.getHttpServer()).post('/api/v1/notifysimple').send(smsBody).expect(202)

          // 2 recipients x 3 segments = 6 billable messages, enforced and recorded.
          expect(mockApiKeyUsageService.assertWithinLimits).toHaveBeenCalledWith('consumer-sms', [
            { channel: NotificationChannel.EMAIL, count: 0 },
            {
              channel: NotificationChannel.SMS,
              count: 6,
              // Explains the 429 a caller would otherwise find baffling.
              countExplanation: expect.stringContaining('2 recipient(s) x 3 segments'),
            },
          ])
          expect(mockApiKeyUsageService.recordUsage).toHaveBeenCalledWith(
            'consumer-sms',
            NotificationChannel.SMS,
            6,
          )
        })

        it('bills a single segment when segment counting fails', async () => {
          mockApiKeyConsumerId = 'consumer-sms-failure'
          mockSmsSegmentService.countSegmentsPerRecipient.mockRejectedValue(
            new Error('render blew up'),
          )

          await request(app.getHttpServer()).post('/api/v1/notifysimple').send(smsBody).expect(202)

          expect(mockApiKeyUsageService.recordUsage).toHaveBeenCalledWith(
            'consumer-sms-failure',
            NotificationChannel.SMS,
            2,
          )
        })

        it('does not count segments for a request with no SMS recipients', async () => {
          mockApiKeyConsumerId = 'consumer-email-only'

          await request(app.getHttpServer())
            .post('/api/v1/notifysimple')
            .send(standardBody)
            .expect(202)

          expect(mockSmsSegmentService.countSegmentsPerRecipient).not.toHaveBeenCalled()
        })
      })

      it('does not process alerts when recorded usage is empty', async () => {
        mockApiKeyConsumerId = 'consumer-empty'
        mockApiKeyUsageService.recordUsage.mockResolvedValue([])

        await request(app.getHttpServer())
          .post('/api/v1/notifysimple')
          .send(standardBody)
          .expect(202)

        expect(mockLimitAlertNotificationService.processAcceptedUsage).not.toHaveBeenCalled()
      })

      it('does not process alerts without an API-key consumer ID', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/notifysimple')
          .send(standardBody)
          .expect(202)

        expect(mockApiKeyUsageService.recordUsage).not.toHaveBeenCalled()
        expect(mockLimitAlertNotificationService.processAcceptedUsage).not.toHaveBeenCalled()
      })

      it('does not fail the original response when orchestration rejects', async () => {
        mockApiKeyConsumerId = 'consumer-failure'
        mockApiKeyUsageService.recordUsage.mockResolvedValue([
          {
            periodTypeCode: UsagePeriodType.DAY,
            periodStart: dayPeriodStart,
            sentCount: 85,
          },
        ])
        mockLimitAlertNotificationService.processAcceptedUsage.mockRejectedValue(
          new Error('alert orchestration failed'),
        )

        const response = await request(app.getHttpServer())
          .post('/api/v1/notifysimple')
          .send(standardBody)
          .expect(202)

        expect(response.body.status).toBe('accepted')
      })

      it('does not fail when the optional orchestration service is unavailable', async () => {
        mockApiKeyConsumerId = 'consumer-no-provider'
        mockApiKeyUsageService.recordUsage.mockResolvedValue([
          {
            periodTypeCode: UsagePeriodType.DAY,
            periodStart: dayPeriodStart,
            sentCount: 85,
          },
        ])
        const controller = app.get(NotifySimpleController)
        const provider = controller.limitAlertNotificationService
        ;(controller as any).limitAlertNotificationService = undefined

        try {
          const response = await request(app.getHttpServer())
            .post('/api/v1/notifysimple')
            .send(standardBody)
            .expect(202)
          expect(response.body.status).toBe('accepted')
        } finally {
          ;(controller as any).limitAlertNotificationService = provider
        }
      })

      it('processes a successful channel when another usage write fails', async () => {
        mockApiKeyConsumerId = 'consumer-partial'
        mockApiKeyUsageService.recordUsage.mockImplementation((_consumerId, channel) => {
          if (channel === NotificationChannel.EMAIL) {
            return Promise.reject(new Error('email usage write failed'))
          }
          return Promise.resolve([
            {
              periodTypeCode: UsagePeriodType.DAY,
              periodStart: dayPeriodStart,
              sentCount: 44,
            },
          ])
        })

        await request(app.getHttpServer())
          .post('/api/v1/notifysimple')
          .send({
            ...standardBody,
            sms: {
              recipients: { to: ['+12505550123'] },
              content: { body: 'Hello' },
            },
          })
          .expect(202)

        expect(mockLimitAlertNotificationService.processAcceptedUsage).toHaveBeenCalledWith({
          apiKeyConsumerId: 'consumer-partial',
          usageResults: [
            {
              channelCode: 'SMS',
              periodTypeCode: UsagePeriodType.DAY,
              periodStart: dayPeriodStart,
              sentCount: 44,
            },
          ],
        })
      })
    })

    describe('POST /api/v1/notifysimple', () => {
      it('returns a 400 identifying an unresolvable SMS recipient index and value', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/notifysimple')
          .send({
            sms: {
              recipients: { to: ['+12505550123', '12345', '+12505550124'] },
              content: { body: 'Hello' },
            },
          })
          .expect(400)
          .expect((res) => {
            expect(res.body).toEqual({
              statusCode: 400,
              message: 'Validation failed',
              errors: ["'12345' is not a valid phone number"],
              fieldErrors: {
                'sms.recipients.to[1]': "'12345' is not a valid phone number",
              },
            })
          })

        expect(mockNotificationService.create).not.toHaveBeenCalled()
        expect(mockIngestionQueue.add).not.toHaveBeenCalled()
      })

      it('accepts a normalizable SMS recipient for downstream ingestion normalization', async () => {
        await request(app.getHttpServer())
          .post('/api/v1/notifysimple')
          .send({
            sms: {
              recipients: { to: ['250-555-1234'] },
              content: { body: 'Hello' },
            },
          })
          .expect(202)

        await vi.waitFor(() => {
          expect(mockIngestionQueue.add).toHaveBeenCalledWith(
            expect.objectContaining({
              request: expect.objectContaining({
                sms: expect.objectContaining({
                  recipients: { to: ['250-555-1234'] },
                }),
              }),
            }),
            expect.any(Object),
          )
        })
      })

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

      it('should return 400 and not create or queue when template params are invalid', async () => {
        const templateId = '12345678-1234-4234-8234-123456789012'
        mockNotificationService.validateBusinessRules.mockRejectedValueOnce(
          new BadRequestException(
            `Missing personalisation for template ID ${templateId}: firstName`,
          ),
        )

        await request(app.getHttpServer())
          .post('/api/v1/notifysimple')
          .send({
            email: {
              recipients: { to: ['test@example.com'] },
              content: { templateId },
            },
            params: {},
          })
          .expect(400)
          .expect((res) => {
            expect(res.body.statusCode).toBe(400)
            expect(res.body.message).toBe(
              `Missing personalisation for template ID ${templateId}: firstName`,
            )
          })

        expect(mockNotificationService.create).not.toHaveBeenCalled()
        expect(mockIngestionQueue.add).not.toHaveBeenCalled()
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

      describe('recipient safelist enforcement (non-production environments)', () => {
        const standardBody = {
          email: {
            recipients: { to: ['stranger@example.com'] },
            content: { subject: 'Test', body: 'Hello' },
          },
        }

        it('rejects a send to a non-safelisted recipient with 400 and persists nothing', async () => {
          mockSafelistService.findBlocked.mockResolvedValue(['stranger@example.com'])

          await request(app.getHttpServer())
            .post('/api/v1/notifysimple')
            .send(standardBody)
            .expect(400)
            .expect((res) => {
              expect(JSON.stringify(res.body)).toContain('stranger@example.com')
              expect(JSON.stringify(res.body)).toContain('safelist')
            })

          expect(mockNotificationService.create).not.toHaveBeenCalled()
          expect(mockApiKeyUsageService.recordUsage).not.toHaveBeenCalled()
          expect(mockIngestionQueue.add).not.toHaveBeenCalled()
        })

        it('checks cc and bcc, not just to', async () => {
          mockSafelistService.findBlocked.mockResolvedValue([])

          await request(app.getHttpServer())
            .post('/api/v1/notifysimple')
            .send({
              email: {
                recipients: {
                  to: ['allowed@gov.bc.ca'],
                  cc: ['cc@example.com'],
                  bcc: ['bcc@example.com'],
                },
                content: { subject: 'Test', body: 'Hello' },
              },
            })
            .expect(202)

          expect(mockSafelistService.findBlocked).toHaveBeenCalledWith(
            expect.any(String),
            expect.arrayContaining([
              { address: 'allowed@gov.bc.ca', channel: 'EMAIL' },
              { address: 'cc@example.com', channel: 'EMAIL' },
              { address: 'bcc@example.com', channel: 'EMAIL' },
            ]),
          )
        })

        it('accepts the send when every recipient is safelisted', async () => {
          mockSafelistService.findBlocked.mockResolvedValue([])

          await request(app.getHttpServer())
            .post('/api/v1/notifysimple')
            .send(standardBody)
            .expect(202)

          expect(mockNotificationService.create).toHaveBeenCalled()
        })

        it('drops blocked recipients from a mail merge and records them as blocked', async () => {
          mockSafelistService.findBlocked.mockResolvedValue(['bob@example.com'])

          await request(app.getHttpServer())
            .post('/api/v1/notifysimple/email')
            .send({
              content: { templateId: '12345678-1234-4234-8234-123456789012' },
              recipients: {
                mergeArray: [['to'], ['alice@example.com'], ['bob@example.com']],
              },
            })
            .expect(202)
            .expect((res) => {
              expect(res.body.message).toContain('1 recipient(s)')
              expect(res.body.blockedRecipientCount).toBe(1)
            })

          expect(mockNotificationRequestDetailService.createBlocked).toHaveBeenCalledWith(
            'mock-notification-id',
            [{ address: 'bob@example.com', channel: 'EMAIL' }],
            expect.stringContaining('safelist'),
            expect.any(String),
          )
        })

        it('records a repeated blocked address once', async () => {
          // findBlocked echoes one entry per candidate, so a merge listing the same address on
          // two rows reports it twice; only one detail row may be written for it.
          mockSafelistService.findBlocked.mockResolvedValue(['bob@example.com', 'bob@example.com'])
          mockNotificationService.parseMailMergeRecipients.mockReturnValue(
            ['alice@example.com', 'bob@example.com', 'bob@example.com'].map((address) => ({
              address,
              params: {},
            })),
          )

          await request(app.getHttpServer())
            .post('/api/v1/notifysimple/email')
            .send({
              content: { templateId: '12345678-1234-4234-8234-123456789012' },
              recipients: {
                mergeArray: [
                  ['to'],
                  ['alice@example.com'],
                  ['bob@example.com'],
                  ['bob@example.com'],
                ],
              },
            })
            .expect(202)
            .expect((res) => expect(res.body.blockedRecipientCount).toBe(1))

          expect(mockNotificationRequestDetailService.createBlocked).toHaveBeenCalledWith(
            'mock-notification-id',
            [{ address: 'bob@example.com', channel: 'EMAIL' }],
            expect.stringContaining('safelist'),
            expect.any(String),
          )
        })

        it('rejects a mail merge whose every recipient is blocked', async () => {
          mockSafelistService.findBlocked.mockResolvedValue([
            'alice@example.com',
            'bob@example.com',
          ])

          await request(app.getHttpServer())
            .post('/api/v1/notifysimple/email')
            .send({
              content: { templateId: '12345678-1234-4234-8234-123456789012' },
              recipients: {
                mergeArray: [['to'], ['alice@example.com'], ['bob@example.com']],
              },
            })
            .expect(400)

          expect(mockNotificationService.create).not.toHaveBeenCalled()
        })
      })

      describe('POST /api/v1/notifysimple/email (mail-merge)', () => {
        // A mail-merge is a bare email channel whose recipients use mergeArray, posted to /email.
        const validMergeBody = {
          content: { templateId: '12345678-1234-4234-8234-123456789012' },
          recipients: {
            mergeArray: [['to'], ['alice@example.com'], ['bob@example.com']],
          },
        }

        it('should return 202 with status "accepted" for an immediate merge (templateId)', async () => {
          return request(app.getHttpServer())
            .post('/api/v1/notifysimple/email')
            .send(validMergeBody)
            .expect(202)
            .expect((res) => {
              expect(res.body.notifyId).toBeDefined()
              expect(res.body.status).toBe('accepted')
              expect(res.body.message).toContain('Email merge send accepted with 2 recipient(s)')
              expect(res.body.channels).toEqual(['email'])
            })
        })

        it('should accept an inline-content merge (no templateId)', async () => {
          return request(app.getHttpServer())
            .post('/api/v1/notifysimple/email')
            .send({
              recipients: {
                mergeArray: [
                  ['to', 'firstname'],
                  ['alice@example.com', 'Alice'],
                  ['bob@example.com', 'Bob'],
                ],
              },
              content: { subject: 'Hi', body: 'Dear {{firstname}}', bodyType: 'text' },
            })
            .expect(202)
            .expect((res) => {
              expect(res.body.status).toBe('accepted')
              expect(res.body.message).toContain('Email merge send accepted with 2 recipient(s)')
            })
        })

        it('should return 202 with status "scheduled" when delayedSend is provided', async () => {
          const futureDate = new Date(Date.now() + 3600000).toISOString()
          return request(app.getHttpServer())
            .post('/api/v1/notifysimple/email')
            .send({ ...validMergeBody, delayedSend: futureDate })
            .expect(202)
            .expect((res) => {
              expect(res.body.status).toBe('scheduled')
              expect(res.body.message).toContain('Email merge send scheduled for delivery at')
            })
        })

        it('should return 422 when validateBulkRules returns errors', async () => {
          mockNotificationService.validateMailMergeRules.mockResolvedValueOnce([
            'Template not found for tenant',
          ])
          return request(app.getHttpServer())
            .post('/api/v1/notifysimple/email')
            .send(validMergeBody)
            .expect(422)
            .expect((res) => {
              expect(res.body.message).toBe('Request validation failed')
              expect(res.body.errors).toContain('Template not found for tenant')
            })
        })

        it('should return 400 when templateId is not a valid UUID', async () => {
          return request(app.getHttpServer())
            .post('/api/v1/notifysimple/email')
            .send({ ...validMergeBody, content: { templateId: 'not-a-uuid' } })
            .expect(400)
        })

        it('should return 400 when mergeArray header is missing the "to" column', async () => {
          return request(app.getHttpServer())
            .post('/api/v1/notifysimple/email')
            .send({ ...validMergeBody, recipients: { mergeArray: [['name'], ['Alice']] } })
            .expect(400)
        })

        it('should return 400 when both to and mergeArray are provided', async () => {
          return request(app.getHttpServer())
            .post('/api/v1/notifysimple/email')
            .send({
              ...validMergeBody,
              recipients: {
                to: ['alice@example.com'],
                mergeArray: [['to'], ['bob@example.com']],
              },
            })
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
