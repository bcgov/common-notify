import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { MergeBatchRunner, settledMergeStatus } from './merge-batch-runner'
import { EMAIL_CHANNEL, SMS_CHANNEL } from './delivery-channel'
import { NotificationStatus } from '../../enum/notification-status.enum'
import type { DeliveryJobPayload } from '../queue.types'
import type { NotificationService } from '../../api/notification/notification.service'
import type { NotificationRequestDetailService } from '../../api/notification/notification-request-detail.service'
import type { TemplatesRepository } from '../../api/templates/templates.repository'

describe('settledMergeStatus', () => {
  it('waits while any recipient is pending', () => {
    expect(settledMergeStatus({ pending: 1, sent: 9 })).toBeNull()
  })

  it.each([
    [{ sent: 3 }, NotificationStatus.COMPLETED],
    [{ sent: 3, blocked: 1 }, NotificationStatus.COMPLETED],
    [{ sent: 2, failed: 1 }, NotificationStatus.PARTIALLY_COMPLETED],
    [{ failed: 3 }, NotificationStatus.FAILED],
    [{}, NotificationStatus.COMPLETED],
  ])('settles %o as %s', (counts, status) => {
    expect(settledMergeStatus(counts)).toBe(status)
  })
})

describe('MergeBatchRunner', () => {
  const notificationService = { update: vi.fn() }
  const requestDetailService = {
    countByStatuses: vi.fn(),
    findBatchRecipients: vi.fn(),
    markRecipientSent: vi.fn(),
    markRecipientFailed: vi.fn(),
    markBatchUnsentFailed: vi.fn(),
  }
  const runner = new MergeBatchRunner(
    notificationService as unknown as NotificationService,
    requestDetailService as unknown as NotificationRequestDetailService,
    { findById: vi.fn() } as unknown as TemplatesRepository,
  )

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
  })

  it('settles the parent from one grouped count, attributed to the channel', async () => {
    requestDetailService.countByStatuses.mockResolvedValue({ sent: 4, failed: 1 })

    await runner.settle('notify-1', 'tenant-1', SMS_CHANNEL)

    expect(requestDetailService.countByStatuses).toHaveBeenCalledTimes(1)
    expect(notificationService.update).toHaveBeenCalledWith('notify-1', 'tenant-1', {
      status: NotificationStatus.PARTIALLY_COMPLETED,
      updatedBy: 'sms-delivery-worker',
    })
  })

  it('records a failed recipient and carries on with the rest of the batch', async () => {
    requestDetailService.findBatchRecipients.mockResolvedValue([
      { address: 'a@example.com', params: {}, status: 'pending' },
      { address: 'b@example.com', params: {}, status: 'pending' },
      { address: 'c@example.com', params: {}, status: 'sent' },
    ])
    requestDetailService.countByStatuses.mockResolvedValue({ sent: 2, failed: 1 })
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('mailbox unavailable'))
      .mockResolvedValueOnce('msg-2')
    const job = {
      id: 'notify-1-EMAIL-0',
      data: {
        notifyId: 'notify-1',
        tenantId: 'tenant-1',
        mailMerge: true,
        batchId: 'notify-1-EMAIL-0',
        mailMergeData: {
          content: { subject: 'Hi', body: 'Hello {{name}}' },
          params: { name: 'all' },
        },
      },
      updateProgress: vi.fn().mockResolvedValue(undefined),
    } as unknown as Job<DeliveryJobPayload>

    const result = await runner.run(job, {
      channel: EMAIL_CHANNEL,
      hasInlineContent: () => true,
      send,
    })

    // The recipient delivered on an earlier attempt is skipped, not sent again.
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ address: 'b@example.com' }),
      { name: 'all' },
      { inline: expect.objectContaining({ renderer: 'handlebars' }) },
    )
    expect(requestDetailService.markRecipientFailed).toHaveBeenCalledWith(
      'notify-1',
      'notify-1-EMAIL-0',
      'a@example.com',
      'mailbox unavailable',
    )
    expect(result).toEqual({ success: false, batchId: 'notify-1-EMAIL-0', sent: 1, failed: 1 })
    expect(notificationService.update).toHaveBeenCalledWith('notify-1', 'tenant-1', {
      status: NotificationStatus.PARTIALLY_COMPLETED,
      updatedBy: 'email-delivery-worker',
    })
  })
})
