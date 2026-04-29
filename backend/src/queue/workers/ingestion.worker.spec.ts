import { Logger } from '@nestjs/common'
import Bull from 'bull'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { IngestionWorker } from './ingestion.worker'
import { IngestionJobPayload, DeliveryJobPayload } from '../queue.types'
import { NotificationChannel } from '../../enum/notification-channel.enum'

describe('IngestionWorker', () => {
  let mockIngestionQueue: Partial<Bull.Queue<IngestionJobPayload>>
  let mockEmailQueue: Partial<Bull.Queue<DeliveryJobPayload>>
  let mockSmsQueue: Partial<Bull.Queue<DeliveryJobPayload>>
  let mockNotificationService: any
  let mockConfigService: any
  let processHandler: (job: Bull.Job<IngestionJobPayload>) => Promise<any>
  let failedCallback: (job: Bull.Job<IngestionJobPayload>, err: Error) => void

  beforeEach(() => {
    // Mock the notification service
    mockNotificationService = {
      update: vi.fn().mockResolvedValue({}),
    }

    // Mock config service
    mockConfigService = {
      get: vi.fn().mockImplementation((key: string) => {
        const config: Record<string, any> = {
          'queue.jobRetries': 3,
          'queue.jobBackoffDelay': 2000,
        }
        return config[key]
      }),
    }

    // Mock the queues
    mockIngestionQueue = {
      process: vi.fn().mockImplementation((...args) => {
        // Handle both: process(handler) and process(concurrency, handler)
        const handler = typeof args[0] === 'function' ? args[0] : args[1]
        processHandler = handler
        return Promise.resolve()
      }),
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === 'failed') {
          failedCallback = callback
        }
        // Don't capture 'completed' event - only tracking failures in tests
      }),
    }

    mockEmailQueue = {
      add: vi.fn().mockResolvedValue({ id: 'email-job-1' }),
    }

    mockSmsQueue = {
      add: vi.fn().mockResolvedValue({ id: 'sms-job-1' }),
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
    it('should register a process handler on the ingestion queue', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
      )

      expect(mockIngestionQueue.process).toHaveBeenCalled()
    })

    it('should register event listeners on the ingestion queue', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
      )

      expect(mockIngestionQueue.on).toHaveBeenCalledWith('failed', expect.any(Function))
    })

    it('should process email delivery job when email channel is requested', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-123',
          tenantId: 'tenant-123',
          request: {
            email: { recipients: ['test@example.com'], subject: 'Test', body: 'Test body' },
          },
          requestedAt: new Date().toISOString(),
        },
      }

      const result = await processHandler(job as Bull.Job<IngestionJobPayload>)

      expect(result).toEqual({ success: true, deliveryJobsQueued: 1 })
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          notifyId: 'notify-123',
          channel: NotificationChannel.EMAIL,
        }),
        expect.objectContaining({
          jobId: 'notify-123_email',
          attempts: 3,
        }),
      )
    })

    it('should process SMS delivery job when SMS channel is requested', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-456',
          tenantId: 'tenant-456',
          request: {
            sms: { recipients: ['+1234567890'], body: 'SMS test' },
          },
          requestedAt: new Date().toISOString(),
        },
      }

      const result = await processHandler(job as Bull.Job<IngestionJobPayload>)

      expect(result).toEqual({ success: true, deliveryJobsQueued: 1 })
      expect(mockSmsQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          notifyId: 'notify-456',
          channel: NotificationChannel.SMS,
        }),
        expect.objectContaining({
          jobId: 'notify-456_sms',
        }),
      )
    })

    it('should process both email and SMS delivery jobs when both channels are requested', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-789',
          tenantId: 'tenant-789',
          request: {
            email: { recipients: ['test@example.com'], subject: 'Test', body: 'Test body' },
            sms: { recipients: ['+1234567890'], body: 'SMS test' },
          },
          requestedAt: new Date().toISOString(),
        },
      }

      const result = await processHandler(job as Bull.Job<IngestionJobPayload>)

      expect(result).toEqual({ success: true, deliveryJobsQueued: 2 })
      expect(mockEmailQueue.add).toHaveBeenCalled()
      expect(mockSmsQueue.add).toHaveBeenCalled()
    })

    it('should add delay for scheduled sends', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
      )

      // Schedule for 1 minute from now
      const scheduledFor = new Date(Date.now() + 60000).toISOString()

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-scheduled',
          tenantId: 'tenant-scheduled',
          request: {
            email: { recipients: ['test@example.com'], subject: 'Test', body: 'Test body' },
          },
          requestedAt: new Date().toISOString(),
          scheduledFor,
        },
      }

      await processHandler(job as Bull.Job<IngestionJobPayload>)

      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          delay: expect.any(Number),
        }),
      )

      // Check that delay is positive (close to 60000ms)
      const callArgs = (mockEmailQueue.add as any).mock.calls[0][1]
      expect(callArgs.delay).toBeGreaterThan(50000)
      expect(callArgs.delay).toBeLessThanOrEqual(60000)
    })

    it('should update status to processing for scheduled notifications', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
      )

      const futureDate = new Date(Date.now() + 60000).toISOString()

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-scheduled',
          tenantId: 'tenant-scheduled',
          request: {
            email: { recipients: ['test@example.com'], subject: 'Test', body: 'Test body' },
          },
          requestedAt: new Date().toISOString(),
          scheduledFor: futureDate,
        },
      }

      await processHandler(job as Bull.Job<IngestionJobPayload>)

      // The notificationService.update should be called to update status to PROCESSING
      // This happens when the scheduled time arrives and the job is now being processed
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'notify-scheduled',
        'tenant-scheduled',
        {
          status: 'processing',
          updatedBy: 'ingestion-worker',
        },
      )
    })

    it('should throw error when no channels are specified', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-no-channel',
          tenantId: 'tenant-no-channel',
          request: {}, // No email or sms
          requestedAt: new Date().toISOString(),
        },
      }

      await expect(processHandler(job as Bull.Job<IngestionJobPayload>)).rejects.toThrow(
        'No delivery channels specified - this should have been caught by validateBusinessRules',
      )
    })

    it('should throw error when request is missing', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-no-request',
          tenantId: 'tenant-no-request',
          request: undefined as any,
          requestedAt: new Date().toISOString(),
        },
      }

      await expect(processHandler(job as Bull.Job<IngestionJobPayload>)).rejects.toThrow(
        'Invalid request: request payload is missing or invalid',
      )
    })

    it('should throw error when notifyId is missing', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: undefined as any,
          tenantId: 'tenant-123',
          request: {
            email: { recipients: ['test@example.com'], subject: 'Test', body: 'Test body' },
          },
          requestedAt: new Date().toISOString(),
        },
      }

      await expect(processHandler(job as Bull.Job<IngestionJobPayload>)).rejects.toThrow(
        'Invalid ingestion job: notifyId is missing or invalid',
      )
    })

    it('should throw error when tenantId is missing', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-123',
          tenantId: null as any,
          request: {
            email: { recipients: ['test@example.com'], subject: 'Test', body: 'Test body' },
          },
          requestedAt: new Date().toISOString(),
        },
      }

      await expect(processHandler(job as Bull.Job<IngestionJobPayload>)).rejects.toThrow(
        'Invalid ingestion job: tenantId is missing or invalid',
      )
    })

    it('should throw error when requestedAt is missing', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-123',
          tenantId: 'tenant-123',
          request: {
            email: { recipients: ['test@example.com'], subject: 'Test', body: 'Test body' },
          },
          requestedAt: undefined as any,
        },
      }

      await expect(processHandler(job as Bull.Job<IngestionJobPayload>)).rejects.toThrow(
        'Invalid ingestion job: requestedAt is missing or invalid',
      )
    })

    it('should register event listeners successfully', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
      )

      expect(mockIngestionQueue.on).toHaveBeenCalledWith('failed', expect.any(Function))
    })

    it('should call failed callback on job error', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-failed',
          tenantId: 'tenant-failed',
          request: {}, // Will cause error: no channels
          requestedAt: new Date().toISOString(),
        },
        attemptsMade: 1,
        opts: { attempts: 3 },
      }

      const error = new Error('Test error')
      try {
        await processHandler(job as Bull.Job<IngestionJobPayload>)
      } catch {
        // Expected
      }

      failedCallback(job as Bull.Job<IngestionJobPayload>, error)

      // The logger.error should be called - check that it was called at all
      expect(Logger.prototype.error).toHaveBeenCalled()
      // Verify it includes the job failure info
      const callArgs = (Logger.prototype.error as any).mock.calls.find(
        (call: any) => call[0] && call[0].includes('Ingestion job failed'),
      )
      expect(callArgs).toBeDefined()
    })

    it('should include job data in delivery payload', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
      )

      const emailPayload = {
        recipients: ['test@example.com'],
        subject: 'Test Subject',
        body: 'Test body',
      }
      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-data',
          tenantId: 'tenant-data',
          request: {
            email: emailPayload,
          },
          requestedAt: new Date().toISOString(),
        },
      }

      await processHandler(job as Bull.Job<IngestionJobPayload>)

      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          notifyId: 'notify-data',
          tenantId: 'tenant-data',
          channel: NotificationChannel.EMAIL,
          payload: emailPayload,
          attempt: 0,
        }),
        expect.any(Object),
      )
    })

    it('should set retry and backoff configuration on delivery jobs', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        mockNotificationService,
        mockConfigService,
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-retry',
          tenantId: 'tenant-retry',
          request: {
            email: { recipients: ['test@example.com'], subject: 'Test', body: 'Test body' },
          },
          requestedAt: new Date().toISOString(),
        },
      }

      await processHandler(job as Bull.Job<IngestionJobPayload>)

      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        }),
      )
    })
  })
})
