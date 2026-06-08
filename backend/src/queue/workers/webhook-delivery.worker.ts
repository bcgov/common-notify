import { Logger } from '@nestjs/common'
import { createHmac } from 'crypto'
import Bull from 'bull'
import axios from 'axios'
import { WebhookJobPayload } from '../queue.types'
import { WebhookService } from '../../api/webhook/webhook.service'
import { WebhookType } from '../../enum/webhook-type.enum'
import { WebhookDeliveryLogRepository } from '../../api/webhook/webhook-delivery-log.repository'

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
 * - 4xx responses: treated as permanent failures (bad client config), no retry
 * - 5xx responses / network errors: retried up to 3 attempts (~5s, 10s, 20s)
 *
 * Idempotency: Job key is webhook_{webhookId}_{notificationId}_{status}
 */
export class WebhookDeliveryWorker {
  /**
   * Initialize the webhook delivery worker on a queue
   * @param webhookQueue The Bull queue instance for webhook delivery jobs
   * @param webhookService Service for fetching webhook configs and delivery logs
   * @param webhookDeliveryLogRepository Repository for logging delivery attempts
   * @param concurrency Number of jobs to process in parallel (default: 2)
   */
  static initialize(
    webhookQueue: Bull.Queue<WebhookJobPayload>,
    webhookService: WebhookService,
    webhookDeliveryLogRepository: WebhookDeliveryLogRepository,
    concurrency: number = 2,
  ): void {
    const logger = new Logger(WebhookDeliveryWorker.name)

    logger.log(`Registering webhook delivery worker processor (concurrency=${concurrency})`)

    webhookQueue.process(concurrency, async (job: Bull.Job<WebhookJobPayload>) => {
      const { notificationId, tenantId, webhookId, event, payload } = job.data
      const attemptNumber = (job.attemptsMade || 0) + 1

      logger.log(
        `[${notificationId}] Processing webhook delivery job for webhook=${webhookId} (attempt ${attemptNumber})`,
      )

      // Fetch the webhook config — it may have been deleted or deactivated since queuing
      const webhookConfig = await webhookService.findById(tenantId, webhookId)
      if (!webhookConfig || !webhookConfig.active) {
        logger.warn(
          `[${notificationId}] Webhook ${webhookId} not found or inactive — skipping delivery`,
        )
        return { success: false, reason: 'webhook_inactive' }
      }

      // Build the POST body
      const genericPostBody = {
        event,
        notificationId,
        tenantId,
        data: payload,
        deliveredAt: new Date().toISOString(),
      }

      // Teams expects a payload formatted in a certain way
      const postBody =
        webhookConfig.webhookType === WebhookType.TEAMS
          ? buildTeamsPayload(notificationId, payload)
          : genericPostBody
      const bodyString = JSON.stringify(postBody)

      // Build headers
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(webhookConfig.headers ?? {}),
      }

      // HMAC-SHA256 sign the raw JSON body if a secret is configured
      if (webhookConfig.secret) {
        const hmac = createHmac('sha256', webhookConfig.secret).update(bodyString).digest('hex')
        requestHeaders['X-Webhook-Signature'] = `sha256=${hmac}`
      }

      let httpStatusCode: number | undefined
      let responseBody: string | undefined

      try {
        const response = await axios.post(webhookConfig.url, postBody, {
          headers: requestHeaders,
          timeout: 30_000,
        })

        httpStatusCode = response.status
        responseBody =
          typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

        await webhookDeliveryLogRepository.logAttempt({
          webhookConfigId: webhookId,
          notificationId,
          tenantId,
          eventType: event,
          httpStatusCode,
          responseBody,
          attemptNumber,
          status: 'SENT',
        })

        logger.log(
          `[${notificationId}] Webhook delivered to ${webhookConfig.url} (status=${httpStatusCode})`,
        )
        return { success: true, statusCode: httpStatusCode }
      } catch (error) {
        const isLastAttempt = (job.attemptsMade || 0) >= (job.opts.attempts || 3) - 1

        if (axios.isAxiosError(error) && error.response) {
          httpStatusCode = error.response.status
          responseBody =
            typeof error.response.data === 'string'
              ? error.response.data
              : JSON.stringify(error.response.data)

          // 4xx = client error (bad URL, auth failure, etc.) — do not retry
          if (httpStatusCode >= 400 && httpStatusCode < 500) {
            await webhookDeliveryLogRepository.logAttempt({
              webhookConfigId: webhookId,
              notificationId,
              tenantId,
              eventType: event,
              httpStatusCode,
              responseBody,
              attemptNumber,
              status: 'FAILED',
            })
            logger.warn(
              `[${notificationId}] Webhook ${webhookId} returned ${httpStatusCode} (4xx) — not retrying`,
            )
            return { success: false, statusCode: httpStatusCode }
          }
        }

        const errorMessage = error instanceof Error ? error.message : String(error)
        const deliveryStatus = isLastAttempt ? 'FAILED' : 'RETRYING'

        await webhookDeliveryLogRepository.logAttempt({
          webhookConfigId: webhookId,
          notificationId,
          tenantId,
          eventType: event,
          httpStatusCode,
          responseBody: responseBody ?? errorMessage,
          attemptNumber,
          status: deliveryStatus,
          nextRetryAt: isLastAttempt
            ? undefined
            : new Date(Date.now() + 5000 * Math.pow(2, attemptNumber)),
        })

        logger.error(
          `[${notificationId}] Webhook delivery to ${webhookConfig.url} failed (attempt ${attemptNumber}): ${errorMessage}`,
        )

        // Re-throw to trigger Bull retry for 5xx / network errors
        throw error
      }
    })

    webhookQueue.on('completed', (job: Bull.Job<WebhookJobPayload>) => {
      const { notificationId, webhookId } = job.data
      logger.debug(`[${notificationId}] Webhook delivery job completed for webhook=${webhookId}`)
    })

    webhookQueue.on('failed', (job: Bull.Job<WebhookJobPayload>, err: Error) => {
      const { notificationId, webhookId } = job.data
      logger.error(
        `[${notificationId}] Webhook delivery job failed for webhook=${webhookId} (attempt ${job.attemptsMade}/${job.opts.attempts}): ${err.message}`,
      )
    })

    logger.log('Webhook delivery worker initialized')
  }
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
