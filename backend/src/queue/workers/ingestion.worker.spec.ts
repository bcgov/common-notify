import { Logger } from '@nestjs/common'
import Bull from 'bull'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { IngestionWorker } from './ingestion.worker'
import { IngestionJobPayload, DeliveryJobPayload } from '../queue.types'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { AttachmentService } from '../../api/attachment/attachment.service'

describe('IngestionWorker', () => {
  let mockIngestionQueue: Partial<Bull.Queue<IngestionJobPayload>>
  let mockEmailQueue: Partial<Bull.Queue<DeliveryJobPayload>>
  let mockSmsQueue: Partial<Bull.Queue<DeliveryJobPayload>>
  let mockNotificationService: any
  let mockConfigService: any
  let mockClamavService: any
  let mockAttachmentService: any
  let processHandler: (job: Bull.Job<IngestionJobPayload>) => Promise<any>

  beforeEach(() => {
    mockNotificationService = {
      update: vi.fn().mockResolvedValue({}),
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
      on: vi.fn(),
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

  it('should fan out email delivery jobs', async () => {
    await IngestionWorker.initialize(
      mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
      mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
      mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
      mockNotificationService,
      mockConfigService,
      mockClamavService,
    )

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
        tenantId: 'tenant-123',
        channel: NotificationChannel.EMAIL,
      }),
      expect.objectContaining({
        jobId: 'notify-123_EMAIL',
      }),
    )
    expect(mockNotificationService.update).toHaveBeenCalledWith(
      'notify-123',
      'tenant-123',
      {
        status: NotificationStatus.PROCESSING,
        updatedBy: 'ingestion-worker',
      },
    )
  })

  it('should scan stored attachment references using attachmentId and tenantId', async () => {
    await IngestionWorker.initialize(
      mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
      mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
      mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
      mockNotificationService,
      mockConfigService,
      mockClamavService,
      1,
      mockAttachmentService as AttachmentService,
    )

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

    await IngestionWorker.initialize(
      mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
      mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
      mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
      mockNotificationService,
      mockConfigService,
      mockClamavService,
      1,
      mockAttachmentService as AttachmentService,
    )

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
    await IngestionWorker.initialize(
      mockIngestionQueue as Bull.Queue<IngestionJobPayload>,
      mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
      mockSmsQueue as Bull.Queue<DeliveryJobPayload>,
      mockNotificationService,
      mockConfigService,
      mockClamavService,
    )

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
})
