import { Logger } from '@nestjs/common'
import Bull from 'bull'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { IngestionWorker } from './ingestion.worker'
import { IngestionJobPayload, DeliveryJobPayload } from '../queue.types'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { AttachmentService } from '../../api/attachment/attachment.service'
import { FAILED_JOB_RETENTION } from '../job-retention'

describe('IngestionWorker', () => {
  let mockIngestionQueue: Partial<Bull.Queue<IngestionJobPayload>>
  let mockEmailQueue: Partial<Bull.Queue<DeliveryJobPayload>>
  let mockSmsQueue: Partial<Bull.Queue<DeliveryJobPayload>>
  let mockNotificationService: any
  let mockRequestDetailService: any
  let mockConfigService: any
  let mockClamavService: any
  let mockAttachmentService: any
  let processHandler: (job: Bull.Job<IngestionJobPayload>) => Promise<any>
  let failedCallback: (job: Bull.Job<IngestionJobPayload>, err: Error) => void

  beforeEach(() => {
    mockNotificationService = {
      update: vi.fn().mockResolvedValue({}),
    }

    mockRequestDetailService = {
      createPending: vi.fn().mockResolvedValue(undefined),
      createMergePending: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      countBatch: vi.fn().mockResolvedValue(0),
      findAddressesByStatus: vi.fn().mockResolvedValue(new Set()),
      // A first run: no rows yet, so every channel is queued.
      countUnbatched: vi.fn().mockResolvedValue(0),
      countInFlight: vi.fn().mockResolvedValue(1),
    }

    mockConfigService = {
      get: vi.fn(),
    }

    mockClamavService = {
      scanBuffer: vi.fn().mockResolvedValue({
        isInfected: false,
        quarantineInfo: undefined,
      }),
    }

    mockAttachmentService = {
      downloadAttachmentByIdAndTenantId: vi.fn().mockResolvedValue({
        attachmentId: 'attachment-123',
        filename: 'stored.pdf',
        fileExtension: 'pdf',
        mimeType: 'application/pdf',
        sizeBytes: 25,
        content: Buffer.from('stored attachment content'),
      } as any),
    }

    mockIngestionQueue = {
      process: vi.fn().mockImplementation((...args) => {
        const handler = typeof args[0] === 'function' ? args[0] : args[1]
        processHandler = handler
        return Promise.resolve()
      }),
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === 'failed') {
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

    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('initialize', () => {
    it('should register a process handler on the ingestion queue', () => {
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

      expect(mockIngestionQueue.process).toHaveBeenCalled()
    })

    it('should register event listeners on the ingestion queue', () => {
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

      expect(mockIngestionQueue.on).toHaveBeenCalledWith('failed', expect.any(Function))
    })

    it('should process email delivery job when email channel is requested', async () => {
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

      const result = await processHandler({
        data: {
          notifyId: 'notify-123',
          tenantId: 'tenant-123',
          request: {
            email: {
              recipients: { to: ['test@example.com'] },
              content: { subject: 'Test', body: 'Test body' },
            },
          },
          requestedAt: new Date().toISOString(),
        },
      } as Bull.Job<IngestionJobPayload>)

      expect(result).toEqual({ success: true, deliveryJobsQueued: 1 })
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          notifyId: 'notify-123',
          channel: NotificationChannel.EMAIL,
        }),
        expect.objectContaining({
          jobId: 'notify-123_EMAIL',
          attempts: 3,
        }),
      )
    })

    it('should process SMS delivery job when SMS channel is requested', async () => {
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-456',
          tenantId: 'tenant-456',
          request: {
            sms: { recipients: { to: ['+1234567890'] }, content: { body: 'SMS test' } },
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
          jobId: 'notify-456_SMS',
        }),
      )
    })

    it('normalizes an SMS recipient once before persistence and delivery fan-out', async () => {
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-normalized-sms',
          tenantId: 'tenant-456',
          request: {
            sms: {
              recipients: { to: ['250-555-1234'] },
              content: { body: 'SMS test' },
            },
          },
          requestedAt: new Date().toISOString(),
        },
      }

      await processHandler(job as Bull.Job<IngestionJobPayload>)

      expect(mockRequestDetailService.createPending).toHaveBeenCalledWith(
        'notify-normalized-sms',
        expect.objectContaining({
          sms: expect.objectContaining({
            recipients: { to: ['+12505551234'] },
          }),
        }),
        'tenant-456',
      )
      expect(mockSmsQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          request: expect.objectContaining({
            sms: expect.objectContaining({ recipients: { to: ['+12505551234'] } }),
          }),
          payload: expect.objectContaining({ recipients: { to: ['+12505551234'] } }),
        }),
        expect.any(Object),
      )
    })

    it('should process both email and SMS delivery jobs when both channels are requested', async () => {
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-789',
          tenantId: 'tenant-789',
          request: {
            email: {
              recipients: { to: ['test@example.com'] },
              content: { subject: 'Test', body: 'Test body' },
            },
            sms: { recipients: { to: ['+1234567890'] }, content: { body: 'SMS test' } },
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
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

      // Schedule for 1 minute from now
      const scheduledFor = new Date(Date.now() + 60000).toISOString()

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-scheduled',
          tenantId: 'tenant-scheduled',
          request: {
            email: {
              recipients: { to: ['test@example.com'] },
              content: { subject: 'Test', body: 'Test body' },
            },
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
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

      const futureDate = new Date(Date.now() + 60000).toISOString()

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-scheduled',
          tenantId: 'tenant-scheduled',
          request: {
            email: {
              recipients: { to: ['test@example.com'] },
              content: { subject: 'Test', body: 'Test body' },
            },
          },
          requestedAt: new Date().toISOString(),
          scheduledFor: futureDate,
        },
      }

      await processHandler(job as Bull.Job<IngestionJobPayload>)

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
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

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
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

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
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: undefined as any,
          tenantId: 'tenant-123',
          request: {
            email: {
              recipients: { to: ['test@example.com'] },
              content: { subject: 'Test', body: 'Test body' },
            },
          },
          requestedAt: new Date().toISOString(),
        },
      }

      await expect(processHandler(job as Bull.Job<IngestionJobPayload>)).rejects.toThrow(
        'Invalid ingestion job: notifyId is missing or invalid',
      )
    })

    it('should throw error when tenantId is missing', async () => {
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-123',
          tenantId: null as any,
          request: {
            email: {
              recipients: { to: ['test@example.com'] },
              content: { subject: 'Test', body: 'Test body' },
            },
          },
          requestedAt: new Date().toISOString(),
        },
      }

      await expect(processHandler(job as Bull.Job<IngestionJobPayload>)).rejects.toThrow(
        'Invalid ingestion job: tenantId is missing or invalid',
      )
    })

    it('should throw error when requestedAt is missing', async () => {
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-123',
          tenantId: 'tenant-123',
          request: {
            email: {
              recipients: { to: ['test@example.com'] },
              content: { subject: 'Test', body: 'Test body' },
            },
          },
          requestedAt: undefined as any,
        },
      }

      await expect(processHandler(job as Bull.Job<IngestionJobPayload>)).rejects.toThrow(
        'Invalid ingestion job: requestedAt is missing or invalid',
      )
    })

    it('should register event listeners successfully', () => {
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

      expect(mockIngestionQueue.on).toHaveBeenCalledWith('failed', expect.any(Function))
    })

    it('should call failed callback on job error', async () => {
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

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
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

      const emailPayload = {
        recipients: { to: ['test@example.com'] },
        content: { subject: 'Test Subject', body: 'Test body' },
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
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-retry',
          tenantId: 'tenant-retry',
          request: {
            email: {
              recipients: { to: ['test@example.com'] },
              content: { subject: 'Test', body: 'Test body' },
            },
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
          removeOnFail: FAILED_JOB_RETENTION,
        }),
      )
    })

    it('should retry the ingestion job when fail-closed scanning blocks unavailable ClamAV', async () => {
      mockClamavService.scanBuffer.mockRejectedValueOnce(
        new Error('ClamAV is unavailable while fail-closed mode is enabled'),
      )

      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
        concurrency: 1,
        attachmentService: mockAttachmentService as AttachmentService,
      })

      const job: Partial<Bull.Job<IngestionJobPayload>> = {
        data: {
          notifyId: 'notify-attachment-retry',
          tenantId: 'tenant-attachment-retry',
          request: {
            email: {
              recipients: { to: ['test@example.com'] },
              content: { subject: 'Test', body: 'Test body' },
              attachments: [
                {
                  attachmentId: 'attachment-retry',
                },
              ],
            },
          },
          requestedAt: new Date().toISOString(),
        },
      }

      await expect(processHandler(job as Bull.Job<IngestionJobPayload>)).rejects.toThrow(
        'Attachment scan failed: ClamAV is unavailable while fail-closed mode is enabled',
      )

      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'notify-attachment-retry',
        'tenant-attachment-retry',
        expect.objectContaining({
          status: 'failed',
          updatedBy: 'ingestion-worker',
        }),
      )
      expect(mockEmailQueue.add).not.toHaveBeenCalled()
    })

    it('should scan stored attachment references using attachmentId and tenantId', async () => {
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
        concurrency: 1,
        attachmentService: mockAttachmentService as AttachmentService,
      })

      const result = await processHandler({
        data: {
          notifyId: 'notify-stored-attachment',
          tenantId: 'tenant-stored-attachment',
          request: {
            email: {
              recipients: { to: ['test@example.com'] },
              content: { subject: 'Test', body: 'Test body' },
              attachments: [{ attachmentId: 'attachment-123' }],
            },
          },
          requestedAt: new Date().toISOString(),
        },
      } as any as Bull.Job<IngestionJobPayload>)

      expect(result).toEqual({ success: true, deliveryJobsQueued: 1 })
      expect(mockAttachmentService.downloadAttachmentByIdAndTenantId).toHaveBeenCalledWith(
        'attachment-123',
        'tenant-stored-attachment',
      )
      expect(mockClamavService.scanBuffer).toHaveBeenCalledWith(
        Buffer.from('stored attachment content'),
        'stored.pdf',
      )
    })

    it('should fail closed when attachment download fails during scanning', async () => {
      mockAttachmentService.downloadAttachmentByIdAndTenantId.mockRejectedValue(
        new Error('Attachment not found'),
      )

      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
        concurrency: 1,
        attachmentService: mockAttachmentService as AttachmentService,
      })

      await expect(
        processHandler({
          data: {
            notifyId: 'notify-stored-attachment-fail',
            tenantId: 'tenant-stored-attachment-fail',
            request: {
              email: {
                recipients: { to: ['test@example.com'] },
                content: { subject: 'Test', body: 'Test body' },
                attachments: [{ attachmentId: 'attachment-404' }],
              },
            },
            requestedAt: new Date().toISOString(),
          },
        } as any as Bull.Job<IngestionJobPayload>),
      ).rejects.toThrow('Attachment scan failed: Attachment not found')

      expect(mockEmailQueue.add).not.toHaveBeenCalled()
      expect(mockNotificationService.update).toHaveBeenCalledWith(
        'notify-stored-attachment-fail',
        'tenant-stored-attachment-fail',
        expect.objectContaining({
          status: NotificationStatus.FAILED,
          updatedBy: 'ingestion-worker',
        }),
      )
    })

    it('should fail when processed attachments are not attachmentId references', async () => {
      IngestionWorker.initialize({
        ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
        emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
        smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
        notificationService: mockNotificationService,
        requestDetailService: mockRequestDetailService,
        configService: mockConfigService,
        clamavService: mockClamavService,
      })

      await expect(
        processHandler({
          data: {
            notifyId: 'notify-invalid-attachments',
            tenantId: 'tenant-invalid-attachments',
            request: {
              email: {
                recipients: { to: ['test@example.com'] },
                content: { subject: 'Test', body: 'Test body' },
                attachments: [{ filename: 'receipt.pdf', content: 'abc' }],
              },
            },
            requestedAt: new Date().toISOString(),
          },
        } as any as Bull.Job<IngestionJobPayload>),
      ).rejects.toThrow('Invalid processed attachment reference payload')

      expect(mockAttachmentService.downloadAttachmentByIdAndTenantId).not.toHaveBeenCalled()
      expect(mockEmailQueue.add).not.toHaveBeenCalled()
    })

    describe('re-run of a plain send', () => {
      it('writes no rows twice, skips a finished channel and leaves row statuses alone', async () => {
        // An earlier run wrote the rows and email finished; only SMS is still owed.
        mockRequestDetailService.countUnbatched.mockResolvedValue(3)
        mockRequestDetailService.countInFlight.mockImplementation((_id: string, channel: string) =>
          Promise.resolve(channel === NotificationChannel.EMAIL ? 0 : 1),
        )
        IngestionWorker.initialize({
          ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
          emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
          smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
          notificationService: mockNotificationService,
          requestDetailService: mockRequestDetailService,
          configService: mockConfigService,
          clamavService: mockClamavService,
        })

        await processHandler({
          data: {
            notifyId: 'notify-rerun',
            tenantId: 'tenant-1',
            requestedAt: new Date().toISOString(),
            request: {
              email: {
                recipients: { to: ['a@example.com'] },
                content: { subject: 'S', body: 'B' },
              },
              sms: { recipients: { to: ['+12505550123'] }, content: { body: 'B' } },
            } as any,
          },
        } as Bull.Job<IngestionJobPayload>)

        expect(mockRequestDetailService.createPending).not.toHaveBeenCalled()
        expect(mockEmailQueue.add).not.toHaveBeenCalled()
        expect(mockSmsQueue.add).toHaveBeenCalledTimes(1)
        // A blanket PROCESSING would put the sent email rows back in flight.
        expect(mockRequestDetailService.updateStatus).not.toHaveBeenCalled()
      })
    })

    describe('bulk email fan-out', () => {
      it('should fan out a bulk job into one batch and update status to PROCESSING', async () => {
        IngestionWorker.initialize({
          ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
          emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
          smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
          notificationService: mockNotificationService,
          requestDetailService: mockRequestDetailService,
          configService: mockConfigService,
          clamavService: mockClamavService,
        })

        const recipients = [
          { address: 'alice@example.com', params: {} },
          { address: 'bob@example.com', params: {} },
        ]
        const job: Partial<Bull.Job<IngestionJobPayload>> = {
          data: {
            notifyId: 'notify-bulk',
            tenantId: 'tenant-bulk',
            request: {} as any,
            requestedAt: new Date().toISOString(),
            mailMerge: true,
            mailMergeData: {
              templateId: 'template-uuid',
              params: { key: 'val' },
              recipients,
            },
          },
        }

        const result = await processHandler(job as Bull.Job<IngestionJobPayload>)

        expect(result).toEqual({ success: true, deliveryJobsQueued: 1 })
        expect(mockRequestDetailService.createMergePending).toHaveBeenCalledTimes(1)
        // Each recipient's params go on its row; the worker renders from there.
        expect(mockRequestDetailService.createMergePending).toHaveBeenCalledWith(
          'notify-bulk',
          'notify-bulk-EMAIL-0',
          recipients,
          'EMAIL',
          'tenant-bulk',
        )
        expect(mockEmailQueue.add).toHaveBeenCalledTimes(1)
        expect(mockEmailQueue.add).toHaveBeenCalledWith(
          expect.objectContaining({
            notifyId: 'notify-bulk',
            tenantId: 'tenant-bulk',
            channel: NotificationChannel.EMAIL,
            mailMerge: true,
            batchId: 'notify-bulk-EMAIL-0',
            mailMergeData: { params: { key: 'val' } },
          }),
          expect.objectContaining({
            jobId: 'notify-bulk-EMAIL-0',
            removeOnComplete: true,
            removeOnFail: FAILED_JOB_RETENTION,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          }),
        )
        expect(mockNotificationService.update).toHaveBeenCalledWith('notify-bulk', 'tenant-bulk', {
          status: 'processing',
          updatedBy: 'ingestion-worker',
        })
      })

      it('should split recipients into multiple batches when addresses exceed batchSize', async () => {
        mockConfigService.get.mockImplementation((key: string) => {
          if (key === 'queue.batchSize') return 2
          return undefined
        })

        IngestionWorker.initialize({
          ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
          emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
          smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
          notificationService: mockNotificationService,
          requestDetailService: mockRequestDetailService,
          configService: mockConfigService,
          clamavService: mockClamavService,
        })

        const job: Partial<Bull.Job<IngestionJobPayload>> = {
          data: {
            notifyId: 'notify-bulk-multi',
            tenantId: 'tenant-bulk',
            request: {} as any,
            requestedAt: new Date().toISOString(),
            mailMerge: true,
            mailMergeData: {
              templateId: 'template-uuid',
              params: {},
              recipients: [
                { address: 'a@example.com', params: {} },
                { address: 'b@example.com', params: {} },
                { address: 'c@example.com', params: {} },
              ],
            },
          },
        }

        const result = await processHandler(job as Bull.Job<IngestionJobPayload>)

        // 3 addresses, batchSize=2 → 2 batches
        expect(result).toEqual({ success: true, deliveryJobsQueued: 2 })
        expect(mockRequestDetailService.createMergePending).toHaveBeenCalledTimes(2)
        expect(mockEmailQueue.add).toHaveBeenCalledTimes(2)
        expect(mockRequestDetailService.createMergePending).toHaveBeenCalledWith(
          'notify-bulk-multi',
          'notify-bulk-multi-EMAIL-0',
          [
            { address: 'a@example.com', params: {} },
            { address: 'b@example.com', params: {} },
          ],
          'EMAIL',
          'tenant-bulk',
        )
        expect(mockRequestDetailService.createMergePending).toHaveBeenCalledWith(
          'notify-bulk-multi',
          'notify-bulk-multi-EMAIL-1',
          [{ address: 'c@example.com', params: {} }],
          'EMAIL',
          'tenant-bulk',
        )
        // Jobs carry the batch id, not its recipients.
        for (const [payload] of mockEmailQueue.add.mock.calls) {
          expect(payload.mailMergeData).not.toHaveProperty('recipients')
        }
      })

      it('should default to batchSize 25 when not configured', async () => {
        // mockConfigService.get returns undefined for queue.batchSize → defaults to 25
        const recipients = Array.from({ length: 150 }, (_, i) => ({
          address: `user${i}@example.com`,
          params: {},
        }))

        IngestionWorker.initialize({
          ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
          emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
          smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
          notificationService: mockNotificationService,
          requestDetailService: mockRequestDetailService,
          configService: mockConfigService,
          clamavService: mockClamavService,
        })

        const job: Partial<Bull.Job<IngestionJobPayload>> = {
          data: {
            notifyId: 'notify-bulk-default',
            tenantId: 'tenant-bulk',
            request: {} as any,
            requestedAt: new Date().toISOString(),
            mailMerge: true,
            mailMergeData: {
              templateId: 'template-uuid',
              params: {},
              recipients,
            },
          },
        }

        const result = await processHandler(job as Bull.Job<IngestionJobPayload>)

        // 150 addresses with default batchSize=25 → 6 batches
        expect(result).toEqual({ success: true, deliveryJobsQueued: 6 })
        expect(mockEmailQueue.add).toHaveBeenCalledTimes(6)
      })

      it('reads recipients from the stored request when the job carries none, less blocked ones', async () => {
        mockNotificationService.findOne = vi.fn().mockResolvedValue({
          payload: {
            email: {
              content: { templateId: 'template-uuid' },
              recipients: {
                mergeArray: [
                  ['email', 'name'],
                  ['a@example.com', 'Ann'],
                  ['blocked@example.com', 'Bo'],
                ],
              },
            },
          },
        })
        mockNotificationService.parseMailMergeRecipients = vi.fn((rows: string[][]) =>
          rows.slice(1).map(([address, name]) => ({ address, params: { name } })),
        )
        mockRequestDetailService.findAddressesByStatus.mockResolvedValue(
          new Set(['blocked@example.com']),
        )

        IngestionWorker.initialize({
          ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
          emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
          smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
          notificationService: mockNotificationService,
          requestDetailService: mockRequestDetailService,
          configService: mockConfigService,
          clamavService: mockClamavService,
        })

        const result = await processHandler({
          data: {
            notifyId: 'notify-db',
            tenantId: 'tenant-bulk',
            request: {} as any,
            requestedAt: new Date().toISOString(),
            mailMerge: true,
            mailMergeData: { content: { templateId: 'template-uuid' }, params: {} },
          },
        } as Bull.Job<IngestionJobPayload>)

        expect(result).toEqual({ success: true, deliveryJobsQueued: 1 })
        expect(mockNotificationService.findOne).toHaveBeenCalledWith('notify-db', 'tenant-bulk')
        expect(mockRequestDetailService.findAddressesByStatus).toHaveBeenCalledWith(
          'notify-db',
          'blocked',
        )
        expect(mockRequestDetailService.createMergePending).toHaveBeenCalledWith(
          'notify-db',
          'notify-db-EMAIL-0',
          [{ address: 'a@example.com', params: { name: 'Ann' } }],
          'EMAIL',
          'tenant-bulk',
        )
      })

      it('does not write rows again for a batch an earlier run of the job created', async () => {
        // An ingestion retry re-runs the fan-out; duplicate rows would send twice.
        mockRequestDetailService.countBatch.mockResolvedValueOnce(2).mockResolvedValue(0)
        mockConfigService.get.mockImplementation((key: string) =>
          key === 'queue.batchSize' ? 2 : undefined,
        )

        IngestionWorker.initialize({
          ingestionQueue: mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
          emailQueue: mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
          smsQueue: mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
          notificationService: mockNotificationService,
          requestDetailService: mockRequestDetailService,
          configService: mockConfigService,
          clamavService: mockClamavService,
        })

        await processHandler({
          data: {
            notifyId: 'notify-retry',
            tenantId: 'tenant-bulk',
            request: {} as any,
            requestedAt: new Date().toISOString(),
            mailMerge: true,
            mailMergeData: {
              params: {},
              recipients: [
                { address: 'a@example.com', params: {} },
                { address: 'b@example.com', params: {} },
                { address: 'c@example.com', params: {} },
              ],
            },
          },
        } as Bull.Job<IngestionJobPayload>)

        // Batch 0 already had rows; only batch 1 is written. Both are (re)queued - Bull ignores a
        // jobId it already holds.
        expect(mockRequestDetailService.createMergePending).toHaveBeenCalledTimes(1)
        expect(mockRequestDetailService.createMergePending).toHaveBeenCalledWith(
          'notify-retry',
          'notify-retry-EMAIL-1',
          [{ address: 'c@example.com', params: {} }],
          'EMAIL',
          'tenant-bulk',
        )
        expect(mockEmailQueue.add).toHaveBeenCalledTimes(2)
      })
    })
  })
})
