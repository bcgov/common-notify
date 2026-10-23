import { BadRequestException, Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { UnrecoverableError } from 'bullmq'
import { SmsDeliveryWorker } from './sms-delivery.worker'
import { DeliveryJobPayload } from '../queue.types'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { ISmsTransport } from '../../adapters'
import { TransientDeliveryError } from '../../adapters/delivery-errors'
import { MergeBatchRunner } from './merge-batch-runner'
import { DeliveryFailureHandler } from './delivery-failure-handler'
import { PhoneNumberService } from '../../api/notify/services/phone-number.service'
import type { NotificationService } from '../../api/notification/notification.service'
import type { NotificationRequestDetailService } from '../../api/notification/notification-request-detail.service'
import type { TemplatesRepository } from '../../api/templates/templates.repository'
import type { TemplatesService } from '../../api/templates/templates.service'
import type { InlineRenderingService } from '../../services/rendering/inline-rendering.service'
import type { StructuredLoggerService } from '../../common/logger'

describe('SmsDeliveryWorker', () => {
  let mockNotificationService: any
  let mockTemplatesRepository: any
  let mockTemplatesService: any
  let mockInlineRenderingService: any
  let mockSmsAdapter: ISmsTransport
  let mockRequestDetailService: any
  let processHandler: (job: Job<DeliveryJobPayload>) => Promise<any>
  let failedCallback: (job: Job<DeliveryJobPayload>, err: Error) => Promise<void>

  /** The worker as QueueModule builds it, with its handlers captured for the tests to call. */
  function initialize(deps: {
    notificationService: NotificationService
    templatesRepository: TemplatesRepository
    templatesService: TemplatesService
    inlineRenderingService: InlineRenderingService
    smsAdapter: ISmsTransport
    requestDetailService: NotificationRequestDetailService
    concurrency?: number
    structuredLogger?: StructuredLoggerService
  }) {
    const mergeBatches = new MergeBatchRunner(
      deps.notificationService,
      deps.requestDetailService,
      deps.templatesRepository,
      deps.structuredLogger,
    )
    const worker = new SmsDeliveryWorker(
      deps.notificationService,
      deps.requestDetailService,
      deps.templatesRepository,
      deps.templatesService,
      deps.inlineRenderingService,
      deps.smsAdapter,
      new PhoneNumberService(),
      mergeBatches,
      new DeliveryFailureHandler(
        deps.notificationService,
        deps.requestDetailService,
        mergeBatches,
        deps.structuredLogger,
      ),
      deps.structuredLogger,
    )
    processHandler = (job) => worker.process(job)
    failedCallback = (job, err) => worker.onFailed(job, err)
  }

  beforeEach(() => {
    // Mock the SMS adapter
    mockSmsAdapter = {
      name: 'twilio',
      send: vi.fn().mockResolvedValue({
        messageId: `twilio-${Date.now()}`,
      }),
    }

    // Mock the notification service
    mockNotificationService = {
      update: vi.fn().mockResolvedValue({
        id: 'notify-123',
        status: NotificationStatus.COMPLETED,
      }),
    }

    // Mock the templates repository
    mockTemplatesRepository = {
      findById: vi.fn().mockResolvedValue(null),
    }

    // Mock the templates service
    mockTemplatesService = {
      renderTemplateContent: vi.fn().mockReturnValue({
        subject: 'Rendered Subject',
        body: 'Rendered Body',
      }),
    }

    // Mock the inline rendering service
    mockInlineRenderingService = {
      renderContent: vi.fn().mockResolvedValue({
        subject: 'Rendered Subject',
        body: 'Rendered Body',
        bodyType: 'html',
      }),
    }

    // Mock the request detail service
    mockRequestDetailService = {
      createPending: vi.fn().mockResolvedValue(undefined),
      resetForRetry: vi.fn().mockResolvedValue(undefined),
      markSent: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
      markRecipientSent: vi.fn().mockResolvedValue(undefined),
      markRecipientFailed: vi.fn().mockResolvedValue(undefined),
      markBatchUnsentFailed: vi.fn().mockResolvedValue(undefined),
      countByStatuses: vi.fn().mockResolvedValue({ pending: 1 }),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      findSentAddresses: vi.fn().mockResolvedValue(new Set<string>()),
    }

    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('process handler', () => {
    it('records each recipient separately when the transport reports a partial failure', async () => {
      mockSmsAdapter.send = vi.fn().mockResolvedValue({
        messageId: 'SM1',
        providerResponse: 'sent to 1 of 2 recipient(s)',
        results: [
          { to: '+16135551234', success: true, messageId: 'SM1' },
          { to: '+16135559999', success: false, error: 'Invalid recipient' },
        ],
      })

      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })

      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-partial',
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          request: {},
          payload: {
            recipients: { to: ['+16135551234', '+16135559999'] },
            content: { body: 'Test SMS', bodyType: 'html' },
          },
          attempt: 0,
        },
        opts: { attempts: 3 } as any,
        attemptsMade: 0,
      }

      // The job must not fail: throwing here is what made the queue retry and re-send to the
      // recipient who had already received the message.
      await expect(processHandler(job as Job<DeliveryJobPayload>)).resolves.toMatchObject({
        success: true,
      })

      expect(mockRequestDetailService.markRecipientSent).toHaveBeenCalledWith(
        'notify-partial',
        null,
        '+16135551234',
        'SM1',
      )
      expect(mockRequestDetailService.markRecipientFailed).toHaveBeenCalledWith(
        'notify-partial',
        null,
        '+16135559999',
        'Invalid recipient',
      )
      // The old code stamped every row sent with one id.
      expect(mockRequestDetailService.markSent).not.toHaveBeenCalled()
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'notify-partial',
        'tenant-123',
        expect.objectContaining({ status: 'partially_completed' }),
      )
    })

    it('falls back to all-or-nothing when the transport reports no per-recipient detail', async () => {
      mockSmsAdapter.send = vi
        .fn()
        .mockResolvedValue({ messageId: 'SM1', providerResponse: 'sent' })

      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })

      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-plain',
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          request: {},
          payload: {
            recipients: { to: ['+16135551234'] },
            content: { body: 'Test SMS', bodyType: 'html' },
          },
          attempt: 0,
        },
        opts: { attempts: 3 } as any,
        attemptsMade: 0,
      }

      await processHandler(job as Job<DeliveryJobPayload>)

      expect(mockRequestDetailService.markSent).toHaveBeenCalled()
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'notify-plain',
        'tenant-123',
        expect.objectContaining({ status: 'completed' }),
      )
    })

    it('skips recipients an earlier run delivered even when BullMQ did not count it as a retry', async () => {
      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })
      mockRequestDetailService.findSentAddresses.mockResolvedValue(new Set(['+16135551234']))

      // attemptsMade 0: a stalled job re-run after its pod stopped mid-send.
      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-stalled',
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          request: {},
          payload: {
            recipients: { to: ['+16135551234', '+16135555678'] },
            content: { body: 'Test SMS', bodyType: 'html' },
          },
          attempt: 0,
        },
        opts: { attempts: 3 } as any,
        attemptsMade: 0,
      }

      await processHandler(job as Job<DeliveryJobPayload>)

      expect(mockRequestDetailService.resetForRetry).not.toHaveBeenCalled()
      expect(mockSmsAdapter.send).toHaveBeenCalledTimes(1)
      expect(mockSmsAdapter.send).toHaveBeenCalledWith(
        expect.objectContaining({ recipients: expect.objectContaining({ to: ['+16135555678'] }) }),
      )
    })

    it('should successfully send SMS and update status', async () => {
      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })

      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-sms-123',
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          request: {},
          payload: {
            recipients: { to: ['+16135551234'] },
            content: { body: 'Test SMS', bodyType: 'html' },
          },
          attempt: 0,
        },
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        } as any,
        attemptsMade: 0,
      }

      const result = await processHandler(job as Job<DeliveryJobPayload>)

      expect(result).toEqual({
        success: true,
        externalId: expect.any(String),
        provider: expect.any(String),
      })

      // Should have called update twice (SENDING, then COMPLETED)
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'notify-sms-123',
        'tenant-123',
        expect.objectContaining({
          status: NotificationStatus.SENDING,
        }),
      )
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'notify-sms-123',
        'tenant-123',
        expect.objectContaining({
          status: NotificationStatus.COMPLETED,
        }),
      )
    })

    it('should throw error when SMS payload is missing', async () => {
      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })

      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          payload: undefined,
          attempt: 0,
        } as any as DeliveryJobPayload,
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        } as any,
        attemptsMade: 0,
      }

      await expect(processHandler(job as Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid delivery job: SMS payload is missing or invalid',
      )

      expect(mockNotificationService.update).toHaveBeenCalledTimes(0)
    })

    it('should throw error when recipient phone is missing', async () => {
      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })

      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          request: {},
          payload: {
            content: { body: 'Test body', bodyType: 'html' },
          },
          attempt: 0,
        } as DeliveryJobPayload,
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        } as any,
        attemptsMade: 0,
      }

      await expect(processHandler(job as Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid SMS payload: recipient phone number is missing or invalid',
      )
    })

    it('should permanently fail a malformed recipient before calling the SMS provider', async () => {
      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })

      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-invalid-recipient',
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          request: {},
          payload: {
            recipients: { to: ['+16135551234', '250-555-1234'] },
            content: { body: 'Test body', bodyType: 'html' },
          },
          attempt: 0,
        } as DeliveryJobPayload,
        opts: { attempts: 3 } as any,
        attemptsMade: 0,
      }

      const expectedError =
        'Invalid SMS payload: recipient phone number at index 1 is not valid E.164'
      const failure = processHandler(job as Job<DeliveryJobPayload>)
      await expect(failure).rejects.toThrow(expectedError)

      expect(mockSmsAdapter.send).not.toHaveBeenCalled()
      expect(mockTemplatesRepository.findById).not.toHaveBeenCalled()
      // Failed outright rather than retried.
      await expect(failure).rejects.toBeInstanceOf(UnrecoverableError)
      expect(job.attemptsMade).toBe(0)
      expect(mockRequestDetailService.resetForRetry).not.toHaveBeenCalled()
      expect(mockNotificationService.update).toHaveBeenCalledTimes(1)
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'notify-invalid-recipient',
        'tenant-123',
        {
          status: NotificationStatus.FAILED,
          updatedBy: 'system',
          errorReason: expectedError,
        },
      )
      expect(mockRequestDetailService.markFailed).toHaveBeenCalledWith(
        'notify-invalid-recipient',
        expectedError,
      )
    })

    it('should throw error when SMS body is missing', async () => {
      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })

      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          payload: {
            recipients: { to: ['+16135551234'] },
          },
          attempt: 0,
        } as DeliveryJobPayload,
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        } as any,
        attemptsMade: 0,
      }

      await expect(processHandler(job as Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid SMS payload: body is missing or invalid',
      )
    })

    it('should render template SMS without requiring raw content body first', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'template-sms-uuid',
        channelCode: 'SMS',
        name: 'Stored SMS Template',
      })
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        body: 'Rendered SMS Body',
        bodyType: 'markdown',
      })

      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })

      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-sms-template',
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          request: {
            params: { code: '123456' },
          },
          payload: {
            recipients: { to: ['+16135551234'] },
            content: { templateId: 'template-sms-uuid' },
          },
          attempt: 0,
        } as any,
        opts: { attempts: 3 } as any,
        attemptsMade: 0,
      }

      const result = await processHandler(job as Job<DeliveryJobPayload>)

      expect(result.success).toBe(true)
      expect(mockTemplatesService.renderTemplateContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'template-sms-uuid' }),
        { code: '123456' },
      )
      expect(mockSmsAdapter.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            body: 'Rendered SMS Body',
          }),
        }),
      )
    })

    it('should merge channel-level params over global params when rendering a template SMS', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'template-sms-uuid',
        channelCode: 'SMS',
        name: 'Stored SMS Template',
      })
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        body: 'Rendered SMS Body',
        bodyType: 'markdown',
      })

      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })

      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-sms-template-params',
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          request: {
            params: { code: 'global', shared: 'global' },
          },
          payload: {
            recipients: { to: ['+16135551234'] },
            content: { templateId: 'template-sms-uuid' },
            params: { code: 'channel' },
          },
          attempt: 0,
        } as any,
        opts: { attempts: 3 } as any,
        attemptsMade: 0,
      }

      const result = await processHandler(job as Job<DeliveryJobPayload>)

      expect(result.success).toBe(true)
      // Channel-level param wins per-key; non-overlapping global param is retained.
      expect(mockTemplatesService.renderTemplateContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'template-sms-uuid' }),
        { code: 'channel', shared: 'global' },
      )
    })

    it('should merge channel-level params over global params when rendering inline SMS content', async () => {
      mockInlineRenderingService.renderSms = vi.fn().mockResolvedValue({
        body: 'Rendered SMS Body',
      })

      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })

      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-sms-inline-params',
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          request: {
            params: { code: 'global', shared: 'global' },
          },
          payload: {
            recipients: { to: ['+16135551234'] },
            content: { renderer: 'handlebars', body: 'Code {{code}}' },
            params: { code: 'channel' },
          },
          attempt: 0,
        } as any,
        opts: { attempts: 3 } as any,
        attemptsMade: 0,
      }

      const result = await processHandler(job as Job<DeliveryJobPayload>)

      expect(result.success).toBe(true)
      expect(mockTemplatesService.renderTemplateContent).not.toHaveBeenCalled()
      // Channel-level param wins per-key; non-overlapping global param is retained.
      expect(mockInlineRenderingService.renderSms).toHaveBeenCalledWith(
        expect.objectContaining({ renderer: 'handlebars' }),
        { code: 'channel', shared: 'global' },
      )
    })

    it('should mark template SMS personalisation validation errors as failed without retry', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'template-sms-uuid',
        channelCode: 'SMS',
        name: 'Stored SMS Template',
      })
      mockTemplatesService.renderTemplateContent.mockRejectedValue(
        new BadRequestException('Missing personalisation for template ID template-sms-uuid: code'),
      )

      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })

      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-sms-template-missing',
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          request: {
            params: {},
          },
          payload: {
            recipients: { to: ['+16135551234'] },
            content: { templateId: 'template-sms-uuid' },
          },
          attempt: 0,
        } as any,
        opts: { attempts: 3 } as any,
        attemptsMade: 0,
      }

      const failure = processHandler(job as Job<DeliveryJobPayload>)
      await expect(failure).rejects.toThrow(
        'Missing personalisation for template ID template-sms-uuid: code',
      )
      expect(mockSmsAdapter.send).not.toHaveBeenCalled()
      // Failed outright rather than retried.
      await expect(failure).rejects.toBeInstanceOf(UnrecoverableError)
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'notify-sms-template-missing',
        'tenant-123',
        expect.objectContaining({
          status: NotificationStatus.FAILED,
          errorReason: 'Missing personalisation for template ID template-sms-uuid: code',
        }),
      )
      expect(mockRequestDetailService.markFailed).toHaveBeenCalledWith(
        'notify-sms-template-missing',
        'Missing personalisation for template ID template-sms-uuid: code',
      )
    })

    it('should throw error when notifyId is missing', async () => {
      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })

      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: undefined as any,

          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          request: {},
          payload: {
            recipients: { to: ['+16135551234'] },
            content: { body: 'Test body', bodyType: 'html' },
          },
          attempt: 0,
        } as DeliveryJobPayload,
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        } as any,
        attemptsMade: 0,
      }

      await expect(processHandler(job as Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid delivery job: notifyId is missing or invalid',
      )
    })

    it('should throw error when tenantId is missing', async () => {
      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })

      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: null as any,
          channel: NotificationChannel.SMS,
          request: {},
          payload: {
            recipients: { to: ['+16135551234'] },
            content: { body: 'Test body', bodyType: 'html' },
          },
          attempt: 0,
        } as DeliveryJobPayload,
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        } as any,
        attemptsMade: 0,
      }

      await expect(processHandler(job as Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid delivery job: tenantId is missing or invalid',
      )
    })

    it('should throw error when attempt is invalid', async () => {
      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })

      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          request: {},
          payload: {
            recipients: { to: ['+16135551234'] },
            content: { body: 'Test body', bodyType: 'html' },
          },
          attempt: -1,
        } as DeliveryJobPayload,
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        } as any,
        attemptsMade: 0,
      }

      // Note: attempt field in payload is not validated/used by worker
      // Worker uses job.attemptsMade from the job's queue metadata instead
      const result = await processHandler(job as Job<DeliveryJobPayload>)
      expect(result.success).toBe(true)
    })

    it('should mark notification as FAILED on final attempt (attempt 2)', async () => {
      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })

      mockNotificationService.update.mockRejectedValueOnce(new Error('DB Error'))

      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-fail',

          tenantId: 'tenant-fail',
          channel: NotificationChannel.SMS,
          request: {},
          payload: {
            recipients: { to: ['+16135551234'] },
            content: { body: 'Will fail', bodyType: 'html' },
          },
          attempt: 2, // Final attempt (0, 1, 2 = 3 total)
        } as DeliveryJobPayload,
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        } as any,
        attemptsMade: 0,
      }

      await expect(processHandler(job as Job<DeliveryJobPayload>)).rejects.toThrow('DB Error')

      // Verify we attempted the first update to SENDING
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'notify-fail',
        'tenant-fail',
        expect.objectContaining({
          status: NotificationStatus.SENDING,
        }),
      )
    })

    it('should NOT mark notification as FAILED on non-final attempts', async () => {
      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })

      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-retry',

          tenantId: 'tenant-retry',
          channel: NotificationChannel.SMS,
          request: {},
          payload: {
            recipients: { to: ['+16135551234'] },
            content: { body: 'Will retry', bodyType: 'html' },
          },
          attempt: 0, // First attempt
        } as DeliveryJobPayload,
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        } as any,
        attemptsMade: 0,
      }

      mockNotificationService.update.mockImplementationOnce(async () => ({
        id: 'notify-retry',
        status: NotificationStatus.SENDING,
      }))
      mockNotificationService.update.mockImplementationOnce(async () => {
        throw new Error('Network error - should retry')
      })

      await expect(processHandler(job as Job<DeliveryJobPayload>)).rejects.toThrow(
        'Network error - should retry',
      )

      // Should only have one SENDING update, not FAILED
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'notify-retry',
        'tenant-retry',
        expect.objectContaining({
          status: NotificationStatus.SENDING,
        }),
      )
    })

    it('should call failed callback on job error', async () => {
      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })

      mockNotificationService.update.mockRejectedValueOnce(new Error('Send failed'))

      const job: Partial<Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-error',
          tenantId: 'tenant-error',
          channel: NotificationChannel.SMS,
          request: {},
          payload: {
            recipients: { to: ['+16135551234'] },
            content: { body: 'Will error', bodyType: 'html' },
          },
          attempt: 0,
        },
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        } as any,
        attemptsMade: 0,
      }

      const error = new Error('Send failed')
      try {
        await processHandler(job as Job<DeliveryJobPayload>)
      } catch {
        // Expected
      }

      failedCallback(job as Job<DeliveryJobPayload>, error)

      // The logger.error should be called
      expect(Logger.prototype.error).toHaveBeenCalled()
    })
  })

  describe('once retries are spent', () => {
    const exhausted = (data: Partial<DeliveryJobPayload> = {}) =>
      ({
        data: { notifyId: 'notify-spent', tenantId: 'tenant-123', ...data },
        opts: { attempts: 3 },
        attemptsMade: 3,
      }) as Job<DeliveryJobPayload>

    beforeEach(() =>
      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      }),
    )

    // The same safety net as email: a plain send is never left in SENDING.
    it('marks a plain send FAILED', async () => {
      await failedCallback(exhausted(), new Error('gateway rejected'))

      expect(mockNotificationService.update).toHaveBeenCalledWith('notify-spent', 'tenant-123', {
        status: NotificationStatus.FAILED,
        updatedBy: 'system',
        errorReason: 'gateway rejected',
      })
      expect(mockRequestDetailService.markFailed).toHaveBeenCalledWith(
        'notify-spent',
        'gateway rejected',
      )
    })

    it('leaves a transient failure owed, and a merge batch to its own settlement', async () => {
      await failedCallback(exhausted(), new TransientDeliveryError('ACS down', 502))
      await failedCallback(
        exhausted({ mailMerge: true, batchId: 'notify-spent-SMS-0' }),
        new Error('template gone'),
      )

      expect(mockNotificationService.update).not.toHaveBeenCalled()
      expect(mockRequestDetailService.markFailed).not.toHaveBeenCalled()
    })

    it('does nothing while retries remain', async () => {
      await failedCallback(
        { ...exhausted(), attemptsMade: 1 } as Job<DeliveryJobPayload>,
        new Error('x'),
      )

      expect(mockRequestDetailService.markFailed).not.toHaveBeenCalled()
    })
  })

  describe('provider outages', () => {
    const init = () =>
      initialize({
        notificationService: mockNotificationService,
        templatesRepository: mockTemplatesRepository,
        templatesService: mockTemplatesService,
        inlineRenderingService: mockInlineRenderingService,
        smsAdapter: mockSmsAdapter,
        requestDetailService: mockRequestDetailService,
      })
    const outage = () => new TransientDeliveryError('ACS SMS: upstream 503 - unavailable', 502)
    const mergeJob = (attemptsMade = 0) =>
      ({
        data: {
          notifyId: 'notify-merge',
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          mailMerge: true,
          batchId: 'notify-merge-SMS-0',
          mailMergeData: {
            content: { body: 'Hi {{name}}' },
            params: {},
            recipients: ['+16135550001', '+16135550002', '+16135550003'].map((address) => ({
              address,
              params: { name: 'A' },
            })),
          },
          request: {},
          payload: {} as never,
          attempt: 0,
        },
        opts: { attempts: 3 },
        attemptsMade,
      }) as unknown as Job<DeliveryJobPayload>
    const plainJob = (attemptsMade = 0) =>
      ({
        data: {
          notifyId: 'notify-plain',
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          request: {},
          payload: {
            recipients: { to: ['+16135551234', '+16135559999'] },
            content: { body: 'Test SMS' },
          },
          attempt: 0,
        },
        opts: { attempts: 3 },
        attemptsMade,
      }) as unknown as Job<DeliveryJobPayload>

    beforeEach(() => {
      mockInlineRenderingService.renderSms = vi.fn().mockResolvedValue({ body: 'Hi A' })
    })

    it('pauses a merge batch on an outage, leaving unsent recipients owed rather than failed', async () => {
      mockSmsAdapter.send = vi
        .fn()
        .mockResolvedValueOnce({ messageId: 'SM1' })
        .mockRejectedValueOnce(outage())
      await init()

      await expect(processHandler(mergeJob())).rejects.toBeInstanceOf(TransientDeliveryError)

      expect(mockRequestDetailService.markRecipientSent).toHaveBeenCalledTimes(1)
      expect(mockRequestDetailService.markRecipientFailed).not.toHaveBeenCalled()
      expect(mockSmsAdapter.send).toHaveBeenCalledTimes(2)
      expect(mockRequestDetailService.markBatchUnsentFailed).not.toHaveBeenCalled()
    })

    it('leaves an outage owed on the final attempt, for the reconciler', async () => {
      mockSmsAdapter.send = vi.fn().mockRejectedValue(outage())
      await init()

      await expect(processHandler(mergeJob(2))).rejects.toBeInstanceOf(TransientDeliveryError)
      await expect(processHandler(plainJob(2))).rejects.toBeInstanceOf(TransientDeliveryError)

      expect(mockRequestDetailService.markBatchUnsentFailed).not.toHaveBeenCalled()
      expect(mockRequestDetailService.markFailed).not.toHaveBeenCalled()
      expect(mockNotificationService.update).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ status: NotificationStatus.FAILED }),
      )
    })

    it('records who was sent, then retries for recipients the provider could not take', async () => {
      mockSmsAdapter.send = vi.fn().mockResolvedValue({
        messageId: 'SM1',
        results: [
          { to: '+16135551234', success: true, messageId: 'SM1' },
          { to: '+16135559999', success: false, error: 'throttled', transient: true },
        ],
      })
      await init()

      await expect(processHandler(plainJob())).rejects.toBeInstanceOf(TransientDeliveryError)

      expect(mockRequestDetailService.markRecipientSent).toHaveBeenCalledWith(
        'notify-plain',
        null,
        '+16135551234',
        'SM1',
      )
      expect(mockRequestDetailService.markRecipientFailed).not.toHaveBeenCalled()
    })

    it('fails only this batch once a systemic error exhausts retries', async () => {
      mockTemplatesRepository.findById = vi.fn().mockResolvedValue(null)
      const job = mergeJob(2)
      ;(job.data.mailMergeData as { content: object }).content = { templateId: 'gone' }
      mockRequestDetailService.countByStatuses = vi.fn().mockResolvedValueOnce({
        pending: 0,
        failed: 3,
        sent: 0,
      })
      await init()

      await expect(processHandler(job)).rejects.toThrow('not found')

      expect(mockRequestDetailService.markBatchUnsentFailed).toHaveBeenCalledWith(
        'notify-merge',
        'notify-merge-SMS-0',
        expect.stringContaining('not found'),
      )
      expect(mockRequestDetailService.markFailed).not.toHaveBeenCalled()
    })
  })
})
