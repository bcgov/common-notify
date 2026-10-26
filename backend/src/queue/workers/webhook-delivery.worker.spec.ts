import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Logger } from '@nestjs/common'
import axios from 'axios'
import type { Job } from 'bullmq'
import { WebhookDeliveryWorker } from './webhook-delivery.worker'
import { WEBHOOK_JOB_OPTIONS } from '../job-options'
import type { WebhookJobPayload } from '../queue.types'
import type { WebhookService } from '../../api/webhook/webhook.service'
import type { WebhookDeliveryLogRepository } from '../../api/webhook/webhook-delivery-log.repository'

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>()
  return { default: { ...actual.default, post: vi.fn() } }
})

describe('WebhookDeliveryWorker', () => {
  const webhookService = {
    findById: vi.fn(),
  }
  const deliveryLog = { logAttempt: vi.fn().mockResolvedValue({}) }
  const worker = new WebhookDeliveryWorker(
    webhookService as unknown as WebhookService,
    deliveryLog as unknown as WebhookDeliveryLogRepository,
  )
  const job = (attemptsMade: number) =>
    ({
      id: 'webhook_w1_n1_completed',
      data: {
        notificationId: 'n1',
        tenantId: 't1',
        webhookId: 'w1',
        event: 'notification.status.changed',
        payload: { status: 'completed' },
      },
      opts: WEBHOOK_JOB_OPTIONS,
      attemptsMade,
    }) as unknown as Job<WebhookJobPayload>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    webhookService.findById.mockResolvedValue({
      active: true,
      url: 'https://tenant.example/hook',
      webhookType: 'generic',
    })
    vi.mocked(axios.post).mockRejectedValue(new Error('connect ECONNREFUSED'))
  })

  // The log row says when the next attempt is due; it must match when the queue retries.
  it.each([
    [0, 5000],
    [1, 15000],
  ])(
    'records the next retry on the queue’s schedule after attempt %i fails',
    async (made, delay) => {
      const before = Date.now()
      await expect(worker.process(job(made))).rejects.toThrow('ECONNREFUSED')

      const [attempt] = deliveryLog.logAttempt.mock.calls[0]
      expect(attempt).toMatchObject({ status: 'RETRYING', attemptNumber: made + 1 })
      const dueIn = (attempt.nextRetryAt as Date).getTime() - before
      expect(dueIn).toBeGreaterThanOrEqual(delay)
      expect(dueIn).toBeLessThan(delay + 1000)
    },
  )

  it('records the last attempt as failed, with no retry due', async () => {
    await expect(worker.process(job(2))).rejects.toThrow('ECONNREFUSED')

    expect(deliveryLog.logAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED', attemptNumber: 3, nextRetryAt: undefined }),
    )
  })
})
