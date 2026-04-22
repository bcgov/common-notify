import { Logger } from '@nestjs/common'
import Bull from 'bull'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SmsDeliveryWorker } from './sms-delivery.worker'
import { DeliveryJobPayload } from '../queue.types'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { NotificationStatus } from '../../notification/schemas'
import { ISmsTransport } from '../../adapters'

describe('SmsDeliveryWorker', () => {
  let mockSmsQueue: Partial<Bull.Queue<DeliveryJobPayload>>
  let mockNotificationService: any
  let mockConfigService: any
  let mockSmsAdapter: ISmsTransport
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
        id: 'record-123',
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
        mockSmsAdapter,
      )

      expect(mockSmsQueue.process).toHaveBeenCalled()
    })

    it('should register event listeners on the SMS queue', async () => {
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockSmsAdapter,
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
        mockSmsAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-sms-123',
          recordId: 'record-sms-123',
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          payload: {
            to: ['+16135551234'],
            body: 'Test SMS',
          },
          attempt: 0,
        },
      }

      const result = await processHandler(job as Bull.Job<DeliveryJobPayload>)

      expect(result).toEqual({
        success: true,
        externalId: expect.any(String),
        provider: expect.any(String),
      })

      // Should have called update twice (SENDING, then COMPLETED)
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'record-sms-123',
        'tenant-123',
        expect.objectContaining({
          status: NotificationStatus.SENDING,
        }),
      )
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'record-sms-123',
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
        mockSmsAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',
          recordId: 'record-123',
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          payload: undefined,
          attempt: 0,
        } as any as DeliveryJobPayload,
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
        mockSmsAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',
          recordId: 'record-123',
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          payload: {
            body: 'Test body',
          },
          attempt: 0,
        } as DeliveryJobPayload,
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
        mockSmsAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',
          recordId: 'record-123',
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          payload: {
            to: ['+16135551234'],
          },
          attempt: 0,
        } as DeliveryJobPayload,
      }

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid SMS payload: body is missing or invalid',
      )
    })

    it('should throw error when notifyId is missing', async () => {
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockSmsAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: undefined as any,
          recordId: 'record-123',
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          payload: {
            to: ['+16135551234'],
            body: 'Test body',
          },
          attempt: 0,
        } as DeliveryJobPayload,
      }

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid delivery job: notifyId is missing or invalid',
      )
    })

    it('should throw error when recordId is missing', async () => {
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockSmsAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',
          recordId: '' as any,
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          payload: {
            to: ['+16135551234'],
            body: 'Test body',
          },
          attempt: 0,
        } as DeliveryJobPayload,
      }

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow(
        'Invalid delivery job: recordId is missing or invalid',
      )
    })

    it('should throw error when tenantId is missing', async () => {
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockSmsAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',
          recordId: 'record-123',
          tenantId: null as any,
          channel: NotificationChannel.SMS,
          payload: {
            to: ['+16135551234'],
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
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockSmsAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-123',
          recordId: 'record-123',
          tenantId: 'tenant-123',
          channel: NotificationChannel.SMS,
          payload: {
            to: ['+16135551234'],
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
      await SmsDeliveryWorker.initialize(
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
        mockSmsAdapter,
      )

      mockNotificationService.update.mockRejectedValueOnce(new Error('DB Error'))

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-fail',
          recordId: 'record-fail',
          tenantId: 'tenant-fail',
          channel: NotificationChannel.SMS,
          payload: {
            to: ['+16135551234'],
            body: 'Will fail',
          },
          attempt: 2, // Final attempt (0, 1, 2 = 3 total)
        } as DeliveryJobPayload,
      }

      await expect(processHandler(job as Bull.Job<DeliveryJobPayload>)).rejects.toThrow('DB Error')

      // Verify we attempted the first update to SENDING
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'record-fail',
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
        mockSmsAdapter,
      )

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-retry',
          recordId: 'record-retry',
          tenantId: 'tenant-retry',
          channel: NotificationChannel.SMS,
          payload: {
            to: ['+16135551234'],
            body: 'Will retry',
          },
          attempt: 0, // First attempt
        } as DeliveryJobPayload,
      }

      mockNotificationService.update.mockImplementationOnce(async () => ({
        id: 'record-retry',
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
        'record-retry',
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
        mockSmsAdapter,
      )

      mockNotificationService.update.mockRejectedValueOnce(new Error('Send failed'))

      const job: Partial<Bull.Job<DeliveryJobPayload>> = {
        data: {
          notifyId: 'notify-error',
          recordId: 'record-error',
          tenantId: 'tenant-error',
          channel: NotificationChannel.SMS,
          payload: {
            to: ['+16135551234'],
            body: 'Will error',
          },
          attempt: 0,
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
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
