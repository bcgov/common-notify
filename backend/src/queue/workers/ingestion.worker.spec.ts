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
  let processHandler: (job: Bull.Job<IngestionJobPayload>) => Promise<any>
  let completedCallback: (job: Bull.Job<IngestionJobPayload>) => void
  let failedCallback: (job: Bull.Job<IngestionJobPayload>, err: Error) => void

  beforeEach(() => {
    // Mock the queues
    mockIngestionQueue = {
      process: vi.fn().mockImplementation((...args) => {
        // Handle both: process(handler) and process(concurrency, handler)
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
      )

      expect(mockIngestionQueue.process).toHaveBeenCalled()
    })

    it('should register event listeners on the ingestion queue', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
      )

      expect(mockIngestionQueue.on).toHaveBeenCalledWith('completed', expect.any(Function))
      expect(mockIngestionQueue.on).toHaveBeenCalledWith('failed', expect.any(Function))
    })

    it('should process email delivery job when email channel is requested', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-123',
          correlationId: 'corr-123',
          tenantId: 'tenant-123',
          request: {
            email: { to: 'test@example.com', subject: 'Test', body: 'Test body' },
          },
          requestedAt: new Date().toISOString(),
        },
      }

      const result = await processHandler(job as Bull.Job<IngestionJobPayload>)

      expect(result).toEqual({ success: true, deliveryJobsQueued: 1 })
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          notifyId: 'notify-123',
          correlationId: 'corr-123',
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
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-456',
          correlationId: 'corr-456',
          tenantId: 'tenant-456',
          request: {
            sms: { to: '+1234567890', body: 'SMS test' },
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
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-789',
          correlationId: 'corr-789',
          tenantId: 'tenant-789',
          request: {
            email: { to: 'test@example.com', subject: 'Test', body: 'Test body' },
            sms: { to: '+1234567890', body: 'SMS test' },
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
      )

      // Schedule for 1 minute from now
      const scheduledFor = new Date(Date.now() + 60000).toISOString()

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-scheduled',
          correlationId: 'corr-scheduled',
          tenantId: 'tenant-scheduled',
          request: {
            email: { to: 'test@example.com', subject: 'Test', body: 'Test body' },
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

    it('should throw error when no channels are specified', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-no-channel',
          correlationId: 'corr-no-channel',
          tenantId: 'tenant-no-channel',
          request: {}, // No email or sms
          requestedAt: new Date().toISOString(),
        },
      }

      await expect(processHandler(job as Bull.Job<IngestionJobPayload>)).rejects.toThrow(
        'No delivery channels specified (email or sms must be present)',
      )
    })

    it('should throw error when request is missing', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-no-request',
          correlationId: 'corr-no-request',
          tenantId: 'tenant-no-request',
          request: undefined as any,
          requestedAt: new Date().toISOString(),
        },
      }

      await expect(processHandler(job as Bull.Job<IngestionJobPayload>)).rejects.toThrow(
        'Invalid request: request payload is missing',
      )
    })

    it('should call completed callback on job success', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-completed',
          correlationId: 'corr-completed',
          tenantId: 'tenant-completed',
          request: {
            email: { to: 'test@example.com', subject: 'Test', body: 'Test body' },
          },
          requestedAt: new Date().toISOString(),
        },
      }

      await processHandler(job as Bull.Job<IngestionJobPayload>)
      completedCallback(job as Bull.Job<IngestionJobPayload>)

      expect(Logger.prototype.debug).toHaveBeenCalledWith(
        expect.stringContaining('Ingestion job completed'),
      )
    })

    it('should call failed callback on job error', async () => {
      await IngestionWorker.initialize(
        mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-failed',
          correlationId: 'corr-failed',
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
      } catch (e) {
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
      )

      const emailPayload = { to: 'test@example.com', subject: 'Test Subject', body: 'Test body' }
      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-data',
          correlationId: 'corr-data',
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
          correlationId: 'corr-data',
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
      )

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-retry',
          correlationId: 'corr-retry',
          tenantId: 'tenant-retry',
          request: {
            email: { to: 'test@example.com', subject: 'Test', body: 'Test body' },
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
