import { Injectable, Logger } from '@nestjs/common'
import { describeError } from '../../common/utils/describe-error'
import { createHmac } from 'node:crypto'
import type { Job } from 'bullmq'
import axios from 'axios'
import { WebhookJobPayload } from '../queue.types'
import { WebhookService } from '../../api/webhook/webhook.service'
import { WebhookType } from '../../enum/webhook-type.enum'
import { WebhookDeliveryLogRepository } from '../../api/webhook/webhook-delivery-log.repository'
import { QueueName } from '../../enum/queue-name.enum'
import { QueueProcessor } from './queue-processor'
import { maxAttempts, retryDelay } from '../job-options'
import { allowedWebhookHeaders } from '../../api/webhook/webhook-headers'
import {
  WEBHOOK_LOGGED_BODY_CHARS,
  isBlockedAddressError,
  isOversizeResponseError,
  webhookRequestConfig,
} from './webhook-request'

/**
 * Webhook Delivery Worker
 *
 * Processes webhook delivery jobs:
 * 1. Receives jobs from the WEBHOOK_DELIVERY queue
 * 2. Fetches the registered webhook config (URL, secret, custom headers)
 * 3. Signs the payload with HMAC-SHA256 if a secret is configured
 * 4. POSTs the event payload to the tenant's registered callback URL
 * 5. Logs each delivery attempt to webhook_delivery_log
 *
 * Retry strategy:
 * - 3xx/4xx responses, internal addresses, oversize responses: permanent failures, no retry
 * - 5xx responses / network errors: 3 attempts, retried after 5s then 15s (WEBHOOK_JOB_OPTIONS)
 *
 * Idempotency: Job key is webhook_{webhookId}_{notificationId}_{status}
 */
@Injectable()
export class WebhookDeliveryWorker implements QueueProcessor<WebhookJobPayload> {
  readonly queueName = QueueName.WEBHOOK_DELIVERY
  readonly concurrency = { configKey: 'webhookDeliveryWorkerConcurrency', default: 2 }
  private readonly logger = new Logger(WebhookDeliveryWorker.name)

  constructor(
    private readonly webhookService: WebhookService,
    private readonly webhookDeliveryLogRepository: WebhookDeliveryLogRepository,
  ) {}

  async process(job: Job<WebhookJobPayload>): Promise<unknown> {
    const { notificationId, tenantId, webhookId, payload } = job.data
    const attemptNumber = (job.attemptsMade || 0) + 1

    this.logger.log(
      `[${notificationId}] Processing webhook delivery job for webhook=${webhookId} (attempt ${attemptNumber})`,
    )

    // It may have been deleted or deactivated since the job was queued.
    const webhookConfig = await this.webhookService.findById(tenantId, webhookId)
    if (!webhookConfig?.active) {
      this.logger.warn(
        `[${notificationId}] Webhook ${webhookId} not found or inactive — skipping delivery`,
      )
      return { success: false, reason: 'webhook_inactive' }
    }

    // Teams expects a payload formatted in a certain way
    const postBody =
      webhookConfig.webhookType === WebhookType.TEAMS
        ? buildTeamsPayload(notificationId, payload)
        : {
            event: job.data.event,
            notificationId,
            tenantId,
            data: payload,
            deliveredAt: new Date().toISOString(),
          }
    const bodyString = JSON.stringify(postBody)

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...allowedWebhookHeaders(webhookConfig.headers),
    }
    // HMAC-SHA256 sign the raw JSON body if a secret is configured
    if (webhookConfig.secret) {
      const hmac = createHmac('sha256', webhookConfig.secret).update(bodyString).digest('hex')
      requestHeaders['X-Webhook-Signature'] = `sha256=${hmac}`
    }

    try {
      const response = await axios.post(webhookConfig.url, postBody, {
        ...webhookRequestConfig(),
        headers: requestHeaders,
      })
      const httpStatusCode = response.status
      await this.logAttempt(job, {
        httpStatusCode,
        responseBody: responseText(response.data),
        status: 'SENT',
      })
      this.logger.log(
        `[${notificationId}] Webhook delivered to ${webhookConfig.url} (status=${httpStatusCode})`,
      )
      return { success: true, statusCode: httpStatusCode }
    } catch (error) {
      return this.handleDeliveryError(job, webhookConfig.url, error)
    }
  }

  onCompleted(job: Job<WebhookJobPayload>): void {
    const { notificationId, webhookId } = job.data
    this.logger.debug(`[${notificationId}] Webhook delivery job completed for webhook=${webhookId}`)
  }

  onFailed(job: Job<WebhookJobPayload>, error: Error): void {
    const { notificationId, webhookId } = job.data
    this.logger.error(
      `[${notificationId}] Webhook delivery job failed for webhook=${webhookId} (attempt ${job.attemptsMade}/${job.opts.attempts}): ${error.message}`,
    )
  }

  /**
   * A 3xx/4xx, an internal address or an oversize response is the tenant's configuration (a
   * redirect, a bad URL, a rejected credential): logged and not retried. Anything else - a
   * 5xx, a network error - is rethrown for the queue to retry.
   */
  private async handleDeliveryError(
    job: Job<WebhookJobPayload>,
    url: string,
    error: unknown,
  ): Promise<{ success: false; statusCode?: number }> {
    const { notificationId, webhookId } = job.data
    const attemptNumber = (job.attemptsMade ?? 0) + 1
    const isLastAttempt = attemptNumber >= maxAttempts(job)
    const response = axios.isAxiosError(error) ? error.response : undefined
    const httpStatusCode = response?.status
    const responseBody = response ? responseText(response.data) : undefined

    if (httpStatusCode && httpStatusCode >= 300 && httpStatusCode < 500) {
      await this.logAttempt(job, { httpStatusCode, responseBody, status: 'FAILED' })
      this.logger.warn(
        `[${notificationId}] Webhook ${webhookId} returned ${httpStatusCode} — not retrying`,
      )
      return { success: false, statusCode: httpStatusCode }
    }

    const errorMessage = describeError(error)
    if (isBlockedAddressError(error) || isOversizeResponseError(error)) {
      await this.logAttempt(job, { responseBody: errorMessage, status: 'FAILED' })
      this.logger.warn(
        `[${notificationId}] Webhook ${webhookId} refused: ${errorMessage} — not retrying`,
      )
      return { success: false }
    }

    await this.logAttempt(job, {
      httpStatusCode,
      responseBody: responseBody ?? errorMessage,
      status: isLastAttempt ? 'FAILED' : 'RETRYING',
      // The same schedule the queue retries on.
      nextRetryAt: isLastAttempt
        ? undefined
        : new Date(Date.now() + retryDelay(job, attemptNumber)),
    })
    this.logger.error(
      `[${notificationId}] Webhook delivery to ${url} failed (attempt ${attemptNumber}): ${errorMessage}`,
    )
    throw error
  }

  private async logAttempt(
    job: Job<WebhookJobPayload>,
    attempt: {
      httpStatusCode?: number
      responseBody?: string
      status: 'SENT' | 'FAILED' | 'RETRYING'
      nextRetryAt?: Date
    },
  ): Promise<void> {
    const { notificationId, tenantId, webhookId, event } = job.data
    await this.webhookDeliveryLogRepository.logAttempt({
      webhookConfigId: webhookId,
      notificationId,
      tenantId,
      eventType: event,
      attemptNumber: (job.attemptsMade || 0) + 1,
      ...attempt,
      responseBody: attempt.responseBody?.slice(0, WEBHOOK_LOGGED_BODY_CHARS),
    })
  }
}

function responseText(data: unknown): string {
  return typeof data === 'string' ? data : JSON.stringify(data)
}

function buildTeamsPayload(notificationId: string, payload: any): any {
  const status = String(payload.status)
  const channel = String(payload.channel)
  const deliveredAt = String(payload.updatedAt)
  const themeColor =
    status.toLowerCase() === 'failed'
      ? 'FF0000'
      : status.toLowerCase() === 'completed'
        ? '42814a'
        : 'FFA500'

  return {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    themeColor,
    summary: `Notification ${status}`,
    sections: [
      {
        activityTitle: 'Notification Status Changed',
        facts: [
          { name: 'Notification ID', value: notificationId },
          { name: 'Status', value: status },
          { name: 'Channel', value: channel },
          { name: 'Delivered At', value: deliveredAt },
        ],
      },
    ],
  }
}
