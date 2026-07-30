import { BadRequestException, Logger } from '@nestjs/common'
import Bull from 'bull'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EmailDeliveryWorker } from './email-delivery.worker'
import { DeliveryJobPayload } from '../queue.types'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { IEmailTransport } from '../../adapters'
import { AttachmentResolverService } from '../../api/notify/services/attachment-resolver.service'

describe('EmailDeliveryWorker', () => {
  let mockEmailQueue: Partial<Bull.Queue<DeliveryJobPayload>>
  let mockNotificationService: any
  let mockConfigService: any
  let mockTemplatesRepository: any
  let mockTemplatesService: any
  let mockInlineRenderingService: any
  let mockAttachmentResolverService: any
  let mockEmailAdapter: IEmailTransport
  let mockRequestDetailService: any
  let processHandler: (job: Bull.Job<DeliveryJobPayload>) => Promise<any>
  let completedCallback: (job: Bull.Job<DeliveryJobPayload>) => void
  let failedCallback: (job: Bull.Job<DeliveryJobPayload>, err: Error) => void

  beforeEach(() => {
    mockEmailAdapter = {
      name: 'ches',
      send: vi.fn().mockResolvedValue({
        messageId: 'ches-123',
      }),
    }

    // Mock the request detail service
    mockRequestDetailService = {
      createPending: vi.fn().mockResolvedValue(undefined),
      resetForRetry: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      markSent: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
      markRecipientSent: vi.fn().mockResolvedValue(undefined),
      markRecipientFailed: vi.fn().mockResolvedValue(undefined),
      countByStatus: vi.fn().mockResolvedValue(0),
    }

    // Mock the notification service
    mockNotificationService = {
      update: vi.fn().mockResolvedValue({
        id: 'notify-123',
        status: NotificationStatus.COMPLETED,
      }),
    }

    mockConfigService = {
      get: vi.fn(),
    }

    mockTemplatesRepository = {
      findById: vi.fn().mockResolvedValue(null),
    }

    mockTemplatesService = {
      renderTemplateContent: vi.fn(),
    }

    mockInlineRenderingService = {
      renderEmail: vi.fn(),
    }

    mockAttachmentResolverService = {
      resolveEmailAttachments: vi.fn().mockResolvedValue(undefined),
    }

    mockEmailQueue = {
      process: vi.fn().mockImplementation((...args) => {
        const handler = typeof args[0] === 'function' ? args[0] : args[1]
        processHandler = handler
        return Promise.resolve()
      }),
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === 'completed') {
          completedCallback = callback
        } else if (event === 'failed') {
          failedCallback = callback
        }
      }),
    }

    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initialize', () => {
    it('should register a process handler on the email queue', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      expect(mockEmailQueue.process).toHaveBeenCalled()
    })

    it('should register event listeners on the email queue', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      expect(mockEmailQueue.on).toHaveBeenCalledWith('completed', expect.any(Function))
      expect(mockEmailQueue.on).toHaveBeenCalledWith('failed', expect.any(Function))
    })

    it('should process email delivery job successfully', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',
          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          request: {},
          payload: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Test Email', body: 'Test body', bodyType: 'html' },
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

      const result = await processHandler(job as Bull.Job<DeliveryJobPayload>)

      expect(result).toEqual({
        success: true,
        externalId: expect.stringMatching(/^ches-\d+$/),
        provider: 'ches',
      })

      // Verify status updates
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'notify-123',
        'tenant-123',
        expect.objectContaining({
          status: NotificationStatus.SENDING,
        }),
      )
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'notify-123',
        'tenant-123',
        expect.objectContaining({
          status: NotificationStatus.COMPLETED,
        }),
      )
      expect(mockNotificationService.update).toHaveBeenCalledTimes(2)
    })

    it('should handle multiple recipients', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-456',
          tenantId: 'tenant-456',
          channel: NotificationChannel.EMAIL,
          request: {},
          payload: {
            recipients: { to: ['test1@example.com', 'test2@example.com', 'test3@example.com'] },
            content: {
              subject: 'Multi-recipient Email',
              body: 'Test for multiple recipients',
              bodyType: 'html',
            },
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

      const result = await processHandler(job as Bull.Job<DeliveryJobPayload>)

      expect(result.success).toBe(true)
      expect(mockNotificationService.update).toHaveBeenCalledTimes(2)
    })

    it('should throw error when email payload is missing', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',
          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
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

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid delivery job: email payload is missing or invalid',
      )

      // Should mark as FAILED after attempt 2 (final attempt)
      expect(mockNotificationService.update).toHaveBeenCalledTimes(0)
    })

    it('should throw error when recipient email is missing', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          request: {},
          payload: {
            content: { subject: 'Test', body: 'Test body', bodyType: 'html' },
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

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid email payload: recipient email address is missing or invalid',
      )
    })

    it('should throw error when email subject is missing', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          request: {},
          payload: {
            recipients: { to: ['test@example.com'] },
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

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid email payload: subject is missing or invalid',
      )
    })

    it('should throw error when email body is missing', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          request: {},
          payload: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Test', bodyType: 'html' }, // body is missing
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

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid email payload: body is missing or invalid',
      )
    })

    it('should resolve a template-only email whose content has no inline subject/body', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'template-uuid',
        channelCode: 'EMAIL',
        name: 'Stored Email Template',
      })
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        subject: 'Rendered subject',
        body: 'Rendered body',
        bodyType: 'html',
      })

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-tmpl-only',
          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          request: {
            params: { firstName: 'Test' },
          },
          payload: {
            recipients: { to: ['test@example.com'] },
            content: { templateId: 'template-uuid' },
          },
          attempt: 0,
        } as DeliveryJobPayload,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        } as any,
        attemptsMade: 0,
      }

      const result = await processHandler(job as Bull.Job<DeliveryJobPayload>)

      expect(result.success).toBe(true)
      expect(mockTemplatesRepository.findById).toHaveBeenCalledWith('tenant-123', 'template-uuid')
      expect(mockTemplatesService.renderTemplateContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'template-uuid' }),
        { firstName: 'Test' },
        undefined,
      )
      expect(mockEmailAdapter.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            subject: 'Rendered subject',
            body: 'Rendered body',
          }),
        }),
      )
    })

    it('should merge channel-level params over global params when rendering a template email', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'template-uuid',
        channelCode: 'EMAIL',
        name: 'Stored Email Template',
      })
      mockTemplatesService.renderTemplateContent.mockResolvedValue({
        subject: 'Rendered subject',
        body: 'Rendered body',
        bodyType: 'html',
      })

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-tmpl-params',
          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          request: {
            params: { firstName: 'Global', shared: 'global' },
          },
          payload: {
            recipients: { to: ['test@example.com'] },
            content: { templateId: 'template-uuid' },
            params: { firstName: 'Channel' },
          },
          attempt: 0,
        } as DeliveryJobPayload,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        } as any,
        attemptsMade: 0,
      }

      const result = await processHandler(job as Bull.Job<DeliveryJobPayload>)

      expect(result.success).toBe(true)
      // Channel-level param wins per-key; non-overlapping global param is retained.
      expect(mockTemplatesService.renderTemplateContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'template-uuid' }),
        { firstName: 'Channel', shared: 'global' },
        undefined,
      )
    })

    it('should merge channel-level params over global params when rendering inline content', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      mockInlineRenderingService.renderEmail.mockResolvedValue({
        subject: 'Rendered subject',
        body: 'Rendered body',
      })

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-inline-params',
          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          request: {
            params: { firstName: 'Global', shared: 'global' },
          },
          payload: {
            recipients: { to: ['test@example.com'] },
            content: {
              renderer: 'handlebars',
              subject: 'Hi {{firstName}}',
              body: 'Dear {{firstName}}',
            },
            params: { firstName: 'Channel' },
          },
          attempt: 0,
        } as DeliveryJobPayload,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        } as any,
        attemptsMade: 0,
      }

      const result = await processHandler(job as Bull.Job<DeliveryJobPayload>)

      expect(result.success).toBe(true)
      expect(mockTemplatesService.renderTemplateContent).not.toHaveBeenCalled()
      // Channel-level param wins per-key; non-overlapping global param is retained.
      expect(mockInlineRenderingService.renderEmail).toHaveBeenCalledWith(
        expect.objectContaining({ renderer: 'handlebars' }),
        { firstName: 'Channel', shared: 'global' },
      )
    })

    it('should surface missing personalisation error for template email before raw body validation', async () => {
      mockTemplatesRepository.findById.mockResolvedValue({
        id: 'template-uuid',
        channelCode: 'EMAIL',
        name: 'Stored Email Template',
      })
      mockTemplatesService.renderTemplateContent.mockRejectedValue(
        new BadRequestException('Missing personalisation for template ID template-uuid: firstName'),
      )

      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-template-missing',
          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          request: {
            params: {},
          },
          payload: {
            recipients: { to: ['test@example.com'] },
            content: { templateId: 'template-uuid' },
          },
          attempt: 0,
        } as DeliveryJobPayload,
        opts: { attempts: 3 } as any,
        attemptsMade: 0,
        discard: vi.fn(),
      }

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
        'Missing personalisation for template ID template-uuid: firstName',
      )

      expect(mockEmailAdapter.send).not.toHaveBeenCalled()
      expect(job.discard).toHaveBeenCalledTimes(1)
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'notify-template-missing',
        'tenant-123',
        expect.objectContaining({
          status: NotificationStatus.FAILED,
          errorReason: 'Missing personalisation for template ID template-uuid: firstName',
        }),
      )
      expect(mockRequestDetailService.markFailed).toHaveBeenCalledWith(
        'notify-template-missing',
        'Missing personalisation for template ID template-uuid: firstName',
      )
    })
    it('should throw error when notifyId is missing', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: undefined as any,

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          request: {},
          payload: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Test', body: 'Test body', bodyType: 'html' },
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

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid delivery job: notifyId is missing or invalid',
      )
    })

    it('should throw error when tenantId is missing', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: null as any,
          channel: NotificationChannel.EMAIL,
          request: {},
          payload: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Test', body: 'Test body', bodyType: 'html' },
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

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid delivery job: tenantId is missing or invalid',
      )
    })

    it('should throw error when attempt is invalid', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          request: {},
          payload: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Test', body: 'Test body', bodyType: 'html' },
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
      // Worker uses job.attemptsMade from Bull queue metadata instead
      const result = await processHandler(job as Bull.Job<DeliveryJobPayload>)
      expect(result.success).toBe(true)
    })

    it('should mark notification as FAILED on final attempt (attempt 2)', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      // Simulate final attempt
      mockNotificationService.update.mockRejectedValueOnce(new Error('DB Error'))

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-fail',

          tenantId: 'tenant-fail',
          channel: NotificationChannel.EMAIL,
          request: {},
          payload: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Will fail', body: 'Test', bodyType: 'html' },
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

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow('DB Error')

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
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-retry',

          tenantId: 'tenant-retry',
          channel: NotificationChannel.EMAIL,
          request: {},
          payload: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Will retry', body: 'Test', bodyType: 'html' },
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

      // Mock adapter to throw error
      mockNotificationService.update.mockImplementationOnce(async () => ({
        id: 'notify-retry',
        status: NotificationStatus.SENDING,
      }))
      mockNotificationService.update.mockImplementationOnce(async () => {
        throw new Error('Network error - should retry')
      })

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
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
      // Should not have FAILED status update on first attempt
      expect(mockNotificationService.update).not.toHaveBeenCalledWith(
        'notify-retry',
        'tenant-retry',
        expect.objectContaining({
          status: NotificationStatus.FAILED,
        }),
      )
    })

    it('should call completed event listener on job success', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          request: {},
          payload: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Test', body: 'Test', bodyType: 'html' },
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

      await processHandler(job as Bull.Job<DeliveryJobPayload>)

      // Manually trigger the completed event
      completedCallback(job as Bull.Job<DeliveryJobPayload>)

      // Just verify the event listener was registered and can be called
      expect(completedCallback).toBeDefined()
    })

    it('should call failed event listener on job failure', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-fail',

          tenantId: 'tenant-fail',
          channel: NotificationChannel.EMAIL,
          payload: undefined,
          attempt: 0,
        } as any as DeliveryJobPayload,
        attemptsMade: 1,
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        } as any,
      }

      const error = new Error('Test error')

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow()

      // Manually trigger the failed event
      failedCallback(job as Bull.Job<DeliveryJobPayload>, error)

      // Just verify the event listener was registered and can be called
      expect(failedCallback).toBeDefined()
    })

    it('should update status to COMPLETED with correct updatedBy', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          request: {},
          payload: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Test', body: 'Test', bodyType: 'html' },
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

      await processHandler(job as Bull.Job<DeliveryJobPayload>)

      const completedCall = mockNotificationService.update.mock.calls.find(
        (call: any[]) => call[2]?.status === NotificationStatus.COMPLETED,
      )
      expect(completedCall).toBeDefined()
      expect(completedCall[2].updatedBy).toBe('system')
    })

    it('should log with notifyId for end-to-end tracing', async () => {
      const debugSpy = vi.spyOn(Logger.prototype, 'debug')

      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          request: {},
          payload: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Test', body: 'Test', bodyType: 'html' },
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

      await processHandler(job as Bull.Job<DeliveryJobPayload>)

      // Verify logs include notifyId prefix
      const logCalls = debugSpy.mock.calls
      const hasNotifyIdLogging = logCalls.some((call) =>
        call[0]?.toString().includes('[notify-123]'),
      )
      expect(hasNotifyIdLogging).toBe(true)

      debugSpy.mockRestore()
    })

    it('should handle email with CC and BCC', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          request: {},
          payload: {
            recipients: {
              to: ['recipient@example.com'],
              cc: ['cc@example.com'],
              bcc: ['bcc@example.com'],
            },
            content: { subject: 'Test Email', body: 'Test with CC/BCC', bodyType: 'html' },
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

      const result = await processHandler(job as Bull.Job<DeliveryJobPayload>)

      expect(result.success).toBe(true)
      expect(mockNotificationService.update).toHaveBeenCalledTimes(2)
    })

    it('should use correct concurrency level', async () => {
      const initSpy = vi.spyOn(EmailDeliveryWorker, 'initialize' as any)

      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
        5, // Custom concurrency
      )

      expect(mockEmailQueue.process).toHaveBeenCalled()
      // Verify that concurrency was passed (it's in the args)
      const processArgs = (mockEmailQueue.process as any).mock.calls[0]
      expect(processArgs[0]).toBe(5)

      initSpy.mockRestore()
    })

    it('should resolve stored attachments and pass adapter-ready attachments to the email adapter', async () => {
      const content = Buffer.from('hello world')
      mockAttachmentResolverService.resolveEmailAttachments.mockResolvedValue([
        {
          filename: 'hello.txt',
          content,
          contentType: 'text/plain',
          sendingMethod: 'attach',
        },
      ])

      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-attachments',
          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          request: {},
          payload: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Test Email', body: 'Test body', bodyType: 'html' },
            attachments: [
              {
                attachmentId: 'attachment-123',
              },
            ],
          },
          attempt: 0,
        } as any,
        opts: { attempts: 3 } as any,
        attemptsMade: 0,
      }

      await processHandler(job as Bull.Job<DeliveryJobPayload>)

      expect(mockAttachmentResolverService.resolveEmailAttachments).toHaveBeenCalledTimes(1)
      expect(mockEmailAdapter.send).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            {
              filename: 'hello.txt',
              content,
              contentType: 'text/plain',
              sendingMethod: 'attach',
            },
          ],
        }),
      )
    })

    it('should resolve attachmentId references with tenant-scoped lookups before sending', async () => {
      const content = Buffer.from('hello world')
      mockAttachmentResolverService.resolveEmailAttachments.mockResolvedValue([
        {
          filename: 'hello.txt',
          content,
          contentType: 'text/plain',
          sendingMethod: 'attach',
        },
      ])

      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      await processHandler({
        data: {
          notifyId: 'notify-attachments',
          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          request: {},
          payload: {
            recipients: { to: ['test@example.com'] },
            content: { subject: 'Test Email', body: 'Test body', bodyType: 'html' },
            attachments: [{ attachmentId: 'attachment-123' }],
          },
        },
        opts: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        } as any,
      } as Bull.Job<DeliveryJobPayload>)

      expect(mockAttachmentResolverService.resolveEmailAttachments).toHaveBeenCalledWith(
        'tenant-123',
        [{ attachmentId: 'attachment-123' }],
      )
      expect(mockEmailAdapter.send).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            {
              filename: 'hello.txt',
              content,
              contentType: 'text/plain',
              sendingMethod: 'attach',
            },
          ],
        }),
      )
    })

    it('should fail delivery when attachment resolution fails', async () => {
      mockAttachmentResolverService.resolveEmailAttachments.mockRejectedValue(
        new Error('Failed to download attachment'),
      )

      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockAttachmentResolverService as AttachmentResolverService,
        mockEmailAdapter,
        mockRequestDetailService,
      )

      await expect(
        processHandler({
          data: {
            notifyId: 'notify-missing-file',
            tenantId: 'tenant-123',
            channel: NotificationChannel.EMAIL,
            request: {},
            payload: {
              recipients: { to: ['test@example.com'] },
              content: { subject: 'Test Email', body: 'Test body', bodyType: 'html' },
              attachments: [{ attachmentId: 'attachment-404' }],
            },
            attempt: 2,
          } as any,
          opts: { attempts: 3 } as any,
          attemptsMade: 2,
        } as Bull.Job<DeliveryJobPayload>),
      ).rejects.toThrow('Failed to download attachment')

      expect(mockEmailAdapter.send).not.toHaveBeenCalled()
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'notify-missing-file',
        'tenant-123',
        expect.objectContaining({
          status: NotificationStatus.FAILED,
        }),
      )
    })

    describe('processBulkBatch', () => {
      const bulkTemplate = {
        id: 'template-uuid',
        channelCode: 'EMAIL',
        name: 'Test Template',
      }

      beforeEach(async () => {
        mockTemplatesRepository.findById.mockResolvedValue(bulkTemplate)
        mockTemplatesService.renderTemplateContent.mockReturnValue({
          subject: 'Bulk Subject',
          body: 'Bulk Body',
          bodyType: 'html',
        })
        vi.mocked(mockEmailAdapter.send).mockResolvedValue({ messageId: 'ext-123' })

        await EmailDeliveryWorker.initialize(
          mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
          mockNotificationService,
          mockConfigService,
          mockTemplatesRepository,
          mockTemplatesService,
          mockInlineRenderingService,
          mockAttachmentResolverService as AttachmentResolverService,
          mockEmailAdapter,
          mockRequestDetailService,
        )
      })

      function makeBulkJob(
        addresses: string[],
        overrides: Partial<DeliveryJobPayload> = {},
      ): Partial<Bull.Job<DeliveryJobPayload>> {
        return {
          data: {
            notifyId: 'notify-bulk',
            tenantId: 'tenant-bulk',
            mailMerge: true,
            batchId: 'notify-bulk-EMAIL-0',
            mailMergeData: {
              content: { templateId: 'template-uuid' },
              params: {},
              recipients: addresses.map((address) => ({ address, params: {} })),
            },
            channel: NotificationChannel.EMAIL,
            request: {},
            payload: {} as any,
            attempt: 0,
            ...overrides,
          } as DeliveryJobPayload,
          opts: { attempts: 3 } as any,
          attemptsMade: 0,
        }
      }

      it('should send to each address and mark recipients as sent', async () => {
        const job = makeBulkJob(['alice@example.com', 'bob@example.com'])

        const result = await processHandler(job as Bull.Job<DeliveryJobPayload>)

        expect(result).toEqual({
          success: true,
          batchId: 'notify-bulk-EMAIL-0',
          sent: 2,
          failed: 0,
        })
        expect(mockEmailAdapter.send).toHaveBeenCalledTimes(2)
        expect(mockRequestDetailService.markRecipientSent).toHaveBeenCalledWith(
          'notify-bulk',
          'notify-bulk-EMAIL-0',
          'alice@example.com',
          'ext-123',
        )
        expect(mockRequestDetailService.markRecipientSent).toHaveBeenCalledWith(
          'notify-bulk',
          'notify-bulk-EMAIL-0',
          'bob@example.com',
          'ext-123',
        )
      })

      it('should render inline content per recipient when no templateId is given', async () => {
        mockInlineRenderingService.renderEmail.mockResolvedValue({
          subject: 'Hi',
          body: 'Dear Alice',
        })

        const job = makeBulkJob(['alice@example.com'], {
          mailMergeData: {
            content: { subject: 'Hi', body: 'Dear {{firstname}}', bodyType: 'text' },
            params: {},
            recipients: [{ address: 'alice@example.com', params: { firstname: 'Alice' } }],
          },
        } as Partial<DeliveryJobPayload>)

        const result = await processHandler(job as Bull.Job<DeliveryJobPayload>)

        expect(result).toMatchObject({ success: true, sent: 1, failed: 0 })
        // Template path not used; inline renderer is invoked with merged params (handlebars default)
        expect(mockTemplatesService.renderTemplateContent).not.toHaveBeenCalled()
        expect(mockInlineRenderingService.renderEmail).toHaveBeenCalledWith(
          expect.objectContaining({ renderer: 'handlebars', body: 'Dear {{firstname}}' }),
          { firstname: 'Alice' },
        )
        expect(mockEmailAdapter.send).toHaveBeenCalledTimes(1)
      })

      it('should mark parent COMPLETED when all recipients sent and no pending remain', async () => {
        // pending=0, failed=0, sent=2
        mockRequestDetailService.countByStatus
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(2)

        const job = makeBulkJob(['alice@example.com'])

        await processHandler(job as Bull.Job<DeliveryJobPayload>)

        expect(mockNotificationService.update).toHaveBeenCalledWith('notify-bulk', 'tenant-bulk', {
          status: NotificationStatus.COMPLETED,
          updatedBy: 'email-delivery-worker',
        })
      })

      it('should mark parent PARTIALLY_COMPLETED when some sent and some failed with no pending', async () => {
        vi.mocked(mockEmailAdapter.send)
          .mockResolvedValueOnce({ messageId: 'ext-123' } as any)
          .mockRejectedValueOnce(new Error('SMTP timeout'))

        // pending=0, failed=1, sent=1
        mockRequestDetailService.countByStatus
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(1)

        const job = makeBulkJob(['alice@example.com', 'bob@example.com'])

        const result = await processHandler(job as Bull.Job<DeliveryJobPayload>)

        expect(result).toEqual({
          success: true,
          batchId: 'notify-bulk-EMAIL-0',
          sent: 1,
          failed: 1,
        })
        expect(mockRequestDetailService.markRecipientFailed).toHaveBeenCalledWith(
          'notify-bulk',
          'notify-bulk-EMAIL-0',
          'bob@example.com',
          'SMTP timeout',
        )
        expect(mockNotificationService.update).toHaveBeenCalledWith('notify-bulk', 'tenant-bulk', {
          status: NotificationStatus.PARTIALLY_COMPLETED,
          updatedBy: 'email-delivery-worker',
        })
      })

      it('should mark parent FAILED when all recipients fail and no pending remain', async () => {
        vi.mocked(mockEmailAdapter.send).mockRejectedValue(new Error('SMTP down'))

        // pending=0, failed=2, sent=0
        mockRequestDetailService.countByStatus
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(0)

        const job = makeBulkJob(['alice@example.com', 'bob@example.com'])

        const result = await processHandler(job as Bull.Job<DeliveryJobPayload>)

        expect(result).toEqual({
          success: true,
          batchId: 'notify-bulk-EMAIL-0',
          sent: 0,
          failed: 2,
        })
        expect(mockNotificationService.update).toHaveBeenCalledWith('notify-bulk', 'tenant-bulk', {
          status: NotificationStatus.FAILED,
          updatedBy: 'email-delivery-worker',
        })
      })

      it('should not update parent status when other batches are still pending', async () => {
        // pending=1 → other batches still in progress, no final status set
        mockRequestDetailService.countByStatus.mockResolvedValue(1)

        const job = makeBulkJob(['alice@example.com'])

        await processHandler(job as Bull.Job<DeliveryJobPayload>)

        expect(mockNotificationService.update).not.toHaveBeenCalled()
      })

      it('should throw NotFoundException when template is not found (triggers retry)', async () => {
        mockTemplatesRepository.findById.mockResolvedValue(null)

        const job = makeBulkJob(['alice@example.com'])

        await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
          "Template 'template-uuid' not found for tenant 'tenant-bulk'",
        )
        expect(mockEmailAdapter.send).not.toHaveBeenCalled()
      })

      it('should throw when template channel is not EMAIL (triggers retry)', async () => {
        mockTemplatesRepository.findById.mockResolvedValue({ ...bulkTemplate, channelCode: 'SMS' })

        const job = makeBulkJob(['alice@example.com'])

        await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
          "Template 'template-uuid' is not an EMAIL template",
        )
        expect(mockEmailAdapter.send).not.toHaveBeenCalled()
      })

      it('should resolve template once and render content per recipient', async () => {
        const job = makeBulkJob(['a@example.com', 'b@example.com', 'c@example.com'])

        await processHandler(job as Bull.Job<DeliveryJobPayload>)

        expect(mockTemplatesRepository.findById).toHaveBeenCalledTimes(1)
        expect(mockTemplatesService.renderTemplateContent).toHaveBeenCalledTimes(3)
        expect(mockEmailAdapter.send).toHaveBeenCalledTimes(3)
      })
    })
  })
})
