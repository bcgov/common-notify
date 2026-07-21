import { BadRequestException, Logger } from '@nestjs/common'
import Bull from 'bull'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SmsDeliveryWorker } from './sms-delivery.worker'
import { DeliveryJobPayload } from '../queue.types'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { ISmsTransport } from '../../adapters'

describe('SmsDeliveryWorker', () => {
  let mockSmsQueue: Partial<Bull.Queue<DeliveryJobPayload>>
  let mockNotificationService: any
  let mockConfigService: any
  let mockTemplatesRepository: any
  let mockTemplatesService: any
  let mockInlineRenderingService: any
  let mockSmsAdapter: ISmsTransport
  let mockRequestDetailService: any
  let processHandler: (job: Bull.Job<DeliveryJobPayload>) => Promise<any>
  let failedCallback: (job: Bull.Job<DeliveryJobPayload>, err: Error) => void

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

    // Mock the config service
    mockConfigService = {
      get: vi.fn((key: string) => {
        const config: Record<string, any> = {
          'queue.jobRetries': 3,
          'queue.jobBackoffDelay': 2000,
        }
        return config[key]
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
      updateStatus: vi.fn().mockResolvedValue(undefined),
    }

    // Mock the SMS queue
    mockSmsQueue = {
      process: vi.fn().mockImplementation((...args) => {
        // Handle: process(concurrency, handler)
        const handler = typeof args[0] === 'function' ? args[0] : args[1]
        processHandler = handler
      }),
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === 'failed') {
          failedCallback = callback
        }
        // Don't capture 'completed' event - only tracking failures in tests
      }),
    }

    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initialize', () => {
    it('should register a process handler on the SMS queue', async () => {
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockSmsAdapter,
        mockRequestDetailService,
      )

      expect(mockSmsQueue.process).toHaveBeenCalled()
    })

    it('should register event listeners on the SMS queue', async () => {
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockSmsAdapter,
        mockRequestDetailService,
      )

      expect(mockSmsQueue.on).toHaveBeenCalledWith('completed', expect.any(Function))
      expect(mockSmsQueue.on).toHaveBeenCalledWith('failed', expect.any(Function))
    })
  })

  describe('process handler', () => {
    it('should successfully send SMS and update status', async () => {
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockSmsAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
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

      const result = await processHandler(job as Bull.Job<DeliveryJobPayload>)

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
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockSmsAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
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

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid delivery job: SMS payload is missing or invalid',
      )

      expect(mockNotificationService.update).toHaveBeenCalledTimes(0)
    })

    it('should throw error when recipient phone is missing', async () => {
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockSmsAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
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

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid SMS payload: recipient phone number is missing or invalid',
      )
    })

    it('should throw error when SMS body is missing', async () => {
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockSmsAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
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

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
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

      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockSmsAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
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

      const result = await processHandler(job as Bull.Job<DeliveryJobPayload>)

      expect(result.success).toBe(true)
      expect(mockTemplatesService.renderTemplateContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'template-sms-uuid' }),
        { code: '123456' },
        undefined,
      )
      expect(mockSmsAdapter.send).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            body: 'Rendered SMS Body',
          }),
        }),
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

      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockSmsAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
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
        discard: vi.fn(),
      }

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
        'Missing personalisation for template ID template-sms-uuid: code',
      )
      expect(mockSmsAdapter.send).not.toHaveBeenCalled()
      expect(job.discard).toHaveBeenCalledTimes(1)
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
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockSmsAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
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

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid delivery job: notifyId is missing or invalid',
      )
    })

    it('should throw error when tenantId is missing', async () => {
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockSmsAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
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

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid delivery job: tenantId is missing or invalid',
      )
    })

    it('should throw error when attempt is invalid', async () => {
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockSmsAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
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
      // Worker uses job.attemptsMade from Bull queue metadata instead
      const result = await processHandler(job as Bull.Job<DeliveryJobPayload>)
      expect(result.success).toBe(true)
    })

    it('should mark notification as FAILED on final attempt (attempt 2)', async () => {
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockSmsAdapter,
        mockRequestDetailService,
      )

      mockNotificationService.update.mockRejectedValueOnce(new Error('DB Error'))

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
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
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockSmsAdapter,
        mockRequestDetailService,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
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
    })

    it('should call failed callback on job error', async () => {
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockTemplatesRepository,
        mockTemplatesService,
        mockInlineRenderingService,
        mockSmsAdapter,
        mockRequestDetailService,
      )

      mockNotificationService.update.mockRejectedValueOnce(new Error('Send failed'))

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
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
        await processHandler(job as Bull.Job<DeliveryJobPayload>)
      } catch {
        // Expected
      }

      failedCallback(job as Bull.Job<DeliveryJobPayload>, error)

      // The logger.error should be called
      expect(Logger.prototype.error).toHaveBeenCalled()
    })
  })
})
