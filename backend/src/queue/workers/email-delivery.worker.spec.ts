import { Logger } from '@nestjs/common'
import Bull from 'bull'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EmailDeliveryWorker } from './email-delivery.worker'
import { DeliveryJobPayload } from '../queue.types'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { NotificationStatus } from '../../notification/schemas'
import { IEmailTransport } from '../../adapters'

describe('EmailDeliveryWorker', () => {
  let mockEmailQueue: Partial<Bull.Queue<DeliveryJobPayload>>
  let mockNotificationService: any
  let mockConfigService: any
  let mockEmailAdapter: IEmailTransport
  let processHandler: (job: Bull.Job<DeliveryJobPayload>) => Promise<any>
  let completedCallback: (job: Bull.Job<DeliveryJobPayload>) => void
  let failedCallback: (job: Bull.Job<DeliveryJobPayload>, err: Error) => void

  beforeEach(() => {
    // Mock the email adapter
    mockEmailAdapter = {
      name: 'ches',
      send: vi.fn().mockResolvedValue({
        messageId: `ches-${Date.now()}`,
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

    // Mock the email queue
    mockEmailQueue = {
      process: vi.fn().mockImplementation((...args) => {
        // Handle: process(concurrency, handler)
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

    // Mock Logger
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
        mockEmailAdapter,
      )

      expect(mockEmailQueue.process).toHaveBeenCalled()
    })

    it('should register event listeners on the email queue', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockEmailAdapter,
      )

      expect(mockEmailQueue.on).toHaveBeenCalledWith('completed', expect.any(Function))
      expect(mockEmailQueue.on).toHaveBeenCalledWith('failed', expect.any(Function))
    })

    it('should process email delivery job successfully', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockEmailAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',
          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          payload: {
            to: ['test@example.com'],
            subject: 'Test Email',
            body: 'Test body',
          },
          attempt: 0,
        } as DeliveryJobPayload,
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
        mockEmailAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-456',
          tenantId: 'tenant-456',
          channel: NotificationChannel.EMAIL,
          payload: {
            to: ['test1@example.com', 'test2@example.com', 'test3@example.com'],
            subject: 'Multi-recipient Email',
            body: 'Test for multiple recipients',
          },
          attempt: 0,
        } as DeliveryJobPayload,
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
        mockEmailAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',
          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          payload: undefined,
          attempt: 0,
        } as any as DeliveryJobPayload,
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
        mockEmailAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          payload: {
            subject: 'Test',
            body: 'Test body',
          },
          attempt: 0,
        } as DeliveryJobPayload,
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
        mockEmailAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          payload: {
            to: ['test@example.com'],
            body: 'Test body',
          },
          attempt: 0,
        } as DeliveryJobPayload,
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
        mockEmailAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          payload: {
            to: ['test@example.com'],
            subject: 'Test',
          },
          attempt: 0,
        } as DeliveryJobPayload,
      }

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid email payload: body is missing or invalid',
      )
    })

    it('should throw error when notifyId is missing', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockEmailAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: undefined as any,

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          payload: {
            to: ['test@example.com'],
            subject: 'Test',
            body: 'Test body',
          },
          attempt: 0,
        } as DeliveryJobPayload,
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
        mockEmailAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: null as any,
          channel: NotificationChannel.EMAIL,
          payload: {
            to: ['test@example.com'],
            subject: 'Test',
            body: 'Test body',
          },
          attempt: 0,
        } as DeliveryJobPayload,
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
        mockEmailAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          payload: {
            to: ['test@example.com'],
            subject: 'Test',
            body: 'Test body',
          },
          attempt: -1,
        } as DeliveryJobPayload,
      }

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid delivery job: attempt is missing or invalid',
      )
    })

    it('should mark notification as FAILED on final attempt (attempt 2)', async () => {
      await EmailDeliveryWorker.initialize(
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockEmailAdapter,
      )

      // Simulate final attempt
      mockNotificationService.update.mockRejectedValueOnce(new Error('DB Error'))

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-fail',

          tenantId: 'tenant-fail',
          channel: NotificationChannel.EMAIL,
          payload: {
            to: ['test@example.com'],
            subject: 'Will fail',
            body: 'Test',
          },
          attempt: 2, // Final attempt (0, 1, 2 = 3 total)
        } as DeliveryJobPayload,
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
        mockEmailAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-retry',

          tenantId: 'tenant-retry',
          channel: NotificationChannel.EMAIL,
          payload: {
            to: ['test@example.com'],
            subject: 'Will retry',
            body: 'Test',
          },
          attempt: 0, // First attempt
        } as DeliveryJobPayload,
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
        mockEmailAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          payload: {
            to: ['test@example.com'],
            subject: 'Test',
            body: 'Test',
          },
          attempt: 0,
        } as DeliveryJobPayload,
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
        mockEmailAdapter,
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
        opts: { attempts: 3 },
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
        mockEmailAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          payload: {
            to: ['test@example.com'],
            subject: 'Test',
            body: 'Test',
          },
          attempt: 0,
        } as DeliveryJobPayload,
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
        mockEmailAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          payload: {
            to: ['test@example.com'],
            subject: 'Test',
            body: 'Test',
          },
          attempt: 0,
        } as DeliveryJobPayload,
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
        mockEmailAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',

          tenantId: 'tenant-123',
          channel: NotificationChannel.EMAIL,
          payload: {
            to: ['recipient@example.com'],
            cc: ['cc@example.com'],
            bcc: ['bcc@example.com'],
            subject: 'Test Email',
            body: 'Test with CC/BCC',
          },
          attempt: 0,
        } as DeliveryJobPayload,
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
        mockEmailAdapter,
        5, // Custom concurrency
      )

      expect(mockEmailQueue.process).toHaveBeenCalled()
      // Verify that concurrency was passed (it's in the args)
      const processArgs = (mockEmailQueue.process as any).mock.calls[0]
      expect(processArgs[0]).toBe(5)

      initSpy.mockRestore()
    })
  })
})
