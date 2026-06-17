import { Logger } from '@nestjs/common'
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
  let processHandler: (job: Bull.Job<DeliveryJobPayload>) => Promise<any>

  beforeEach(() => {
    mockEmailAdapter = {
      name: 'ches',
      send: vi.fn().mockResolvedValue({
        messageId: 'ches-123',
      }),
    }

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
      on: vi.fn(),
    }

    vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should process email delivery jobs without attachments', async () => {
    await EmailDeliveryWorker.initialize(
      mockEmailQueue as Bull.Queue<DeliveryJobPayload>,
      mockNotificationService,
      mockConfigService,
      mockTemplatesRepository,
      mockTemplatesService,
      mockInlineRenderingService,
      mockAttachmentResolverService as AttachmentResolverService,
      mockEmailAdapter,
    )

    const result = await processHandler({
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
      opts: { attempts: 3 } as any,
      attemptsMade: 0,
    } as Bull.Job<DeliveryJobPayload>)

    expect(result).toEqual({
      success: true,
      externalId: 'ches-123',
      provider: 'ches',
    })
    expect(mockAttachmentResolverService.resolveEmailAttachments).not.toHaveBeenCalled()
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
        attempt: 0,
      } as any,
      opts: { attempts: 3 } as any,
      attemptsMade: 0,
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
})
