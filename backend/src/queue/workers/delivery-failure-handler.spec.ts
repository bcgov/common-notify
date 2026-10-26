import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { DeliveryFailureHandler } from './delivery-failure-handler'
import { EMAIL_CHANNEL } from './delivery-channel'
import type { MergeBatchRunner } from './merge-batch-runner'
import type { DeliveryJobPayload } from '../queue.types'
import type { NotificationService } from '../../api/notification/notification.service'
import type { NotificationRequestDetailService } from '../../api/notification/notification-request-detail.service'

describe('DeliveryFailureHandler', () => {
  const notificationService = { update: vi.fn().mockResolvedValue(undefined) }
  const requestDetailService = { markFailed: vi.fn().mockResolvedValue(undefined) }
  const handler = new DeliveryFailureHandler(
    notificationService as unknown as NotificationService,
    requestDetailService as unknown as NotificationRequestDetailService,
    {} as MergeBatchRunner,
  )
  const job = (attemptsMade: number, attempts?: number) =>
    ({
      data: { notifyId: 'n1', tenantId: 't1' },
      opts: attempts === undefined ? {} : { attempts },
      attemptsMade,
    }) as unknown as Job<DeliveryJobPayload>

  let error: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    vi.clearAllMocks()
    error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
  })

  it('reports attempts from the job, not a fixed count', async () => {
    await expect(
      handler.fail(job(3, 5), new Error('boom'), EMAIL_CHANNEL, Date.now()),
    ).rejects.toThrow()

    expect(error).toHaveBeenCalledWith(expect.stringContaining('(attempt 4/5)'), expect.anything())
    // Not the last of five, so nothing is marked yet.
    expect(requestDetailService.markFailed).not.toHaveBeenCalled()
  })

  it('marks the send failed on the job’s own last attempt', async () => {
    await expect(
      handler.fail(job(4, 5), new Error('boom'), EMAIL_CHANNEL, Date.now()),
    ).rejects.toThrow()

    expect(requestDetailService.markFailed).toHaveBeenCalledWith('n1', 'boom')
    expect(error).toHaveBeenCalledWith(expect.stringContaining('after 5 attempt(s)'))
  })

  it('treats a job queued without attempts as on its only attempt, as BullMQ does', async () => {
    await expect(
      handler.fail(job(0), new Error('boom'), EMAIL_CHANNEL, Date.now()),
    ).rejects.toThrow()

    expect(error).toHaveBeenCalledWith(expect.stringContaining('(attempt 1/1)'), expect.anything())
    expect(requestDetailService.markFailed).toHaveBeenCalled()
  })
})
