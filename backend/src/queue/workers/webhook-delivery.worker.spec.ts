import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Logger } from '@nestjs/common'
import axios, { type AxiosResponse } from 'axios'
import type { Job } from 'bullmq'
import { WebhookDeliveryWorker } from './webhook-delivery.worker'
import { WEBHOOK_JOB_OPTIONS } from '../job-options'
import { WEBHOOK_LOGGED_BODY_CHARS, WEBHOOK_MAX_RESPONSE_BYTES } from './webhook-request'
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
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
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

  const httpError = (status: number, data: unknown = '') =>
    new axios.AxiosError(
      `Request failed with status code ${status}`,
      'ERR_BAD_RESPONSE',
      undefined,
      {},
      {
        status,
        data,
      } as AxiosResponse,
    )

  const lastLogged = () => deliveryLog.logAttempt.mock.calls.at(-1)[0]

  it('posts with redirects off, a size cap and the filtering agents', async () => {
    vi.mocked(axios.post).mockResolvedValue({ status: 200, data: 'ok' })

    await worker.process(job(0))

    expect(axios.post).toHaveBeenCalledWith(
      'https://tenant.example/hook',
      expect.anything(),
      expect.objectContaining({
        maxRedirects: 0,
        maxContentLength: WEBHOOK_MAX_RESPONSE_BYTES,
        httpAgent: expect.anything(),
        httpsAgent: expect.anything(),
        proxy: false,
      }),
    )
  })

  it('records a redirect as a failed delivery, without retrying', async () => {
    vi.mocked(axios.post).mockRejectedValue(httpError(302))

    await expect(worker.process(job(0))).resolves.toMatchObject({ success: false, statusCode: 302 })
    expect(lastLogged()).toMatchObject({ status: 'FAILED', httpStatusCode: 302 })
  })

  it('records a hostname that resolves internally as failed, without retrying', async () => {
    vi.mocked(axios.post).mockRejectedValue(
      axios.AxiosError.from(
        new Error(
          'DNS lookup 10.0.0.5(family:4, host:tenant.example) is not allowed. Because, It is private IP address.',
        ),
      ),
    )

    await expect(worker.process(job(0))).resolves.toMatchObject({ success: false })
    expect(lastLogged()).toMatchObject({ status: 'FAILED' })
    expect(lastLogged().responseBody).toContain('10.0.0.5')
  })

  it('records an oversize response as failed, without retrying', async () => {
    vi.mocked(axios.post).mockRejectedValue(
      new axios.AxiosError(
        `maxContentLength size of ${WEBHOOK_MAX_RESPONSE_BYTES} exceeded`,
        axios.AxiosError.ERR_BAD_RESPONSE,
      ),
    )

    await expect(worker.process(job(0))).resolves.toMatchObject({ success: false })
    expect(lastLogged()).toMatchObject({ status: 'FAILED' })
  })

  it.each([
    ['a success', () => Promise.resolve({ status: 200, data: 'x'.repeat(50_000) })],
    ['a 4xx', () => Promise.reject(httpError(400, 'x'.repeat(50_000)))],
  ])('truncates the stored body of %s', async (_label, respond) => {
    vi.mocked(axios.post).mockImplementation(respond)

    await worker.process(job(0))

    expect(lastLogged().responseBody).toHaveLength(WEBHOOK_LOGGED_BODY_CHARS)
  })

  // Rows registered before the DTO rejected these headers still hold them.
  it('drops blocked headers stored on an existing registration', async () => {
    webhookService.findById.mockResolvedValue({
      active: true,
      url: 'https://tenant.example/hook',
      webhookType: 'generic',
      headers: { Host: 'redis.svc', 'X-Forwarded-For': '10.0.0.1', Authorization: 'Bearer t' },
    })
    vi.mocked(axios.post).mockResolvedValue({ status: 200, data: '' })

    await worker.process(job(0))

    const { headers } = vi.mocked(axios.post).mock.calls[0][2]
    expect(headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer t' })
  })
})
