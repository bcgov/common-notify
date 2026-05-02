import { Logger } from '@nestjs/common'
import Bull from 'bull'
import { ConfigService } from '@nestjs/config'
import { DeliveryJobPayload } from '../queue.types'
import { NotificationService } from '../../api/notification/notification.service'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { ISmsTransport } from '../../adapters'

/**
 * SMS Delivery Worker
 *
 * Processes SMS delivery jobs:
 * 1. Receives SMS delivery jobs from the SMS_DELIVERY queue
 * 2. Updates notification status to SENDING in database
 * 3. Gets the appropriate adapter (future: GC Notify, Twilio, etc)
 * 4. Sends SMS via adapter
 * 5. Updates notification status to COMPLETED on success, FAILED on error
 * 6. Implements retry logic with exponential backoff
 *
 * Idempotency: Job key is notifyId_sms, preventing duplicate delivery
 * Tracing: All operations logged with notifyId for end-to-end visibility
 */
export class SmsDeliveryWorker {
  private readonly logger = new Logger(SmsDeliveryWorker.name)

  /**
   * Initialize the SMS delivery worker on a queue
   * @param smsQueue The BullMQ queue instance for SMS delivery jobs
   * @param notificationService Service for database updates
   * @param configService Configuration service for queue settings
   * @param smsAdapter SMS transport adapter for sending SMS messages
   * @param concurrency Number of jobs to process in parallel (default: 2)
   */
  static async initialize(
    smsQueue: Bull.Queue<DeliveryJobPayload>,
    notificationService: NotificationService,
    configService: ConfigService,
    smsAdapter: ISmsTransport,
    concurrency: number = 2,
  ): Promise<void> {
    const logger = new Logger(SmsDeliveryWorker.name)

    logger.log(`Registering SMS delivery worker processor (concurrency=${concurrency})`)

    // Register the job processor with configurable concurrency
    // Note: Don't await process() - it sets up listeners and never resolves
    smsQueue.process(concurrency, async (job: Bull.Job<DeliveryJobPayload>) => {
      const { notifyId, tenantId, payload, attempt } = job.data

      logger.debug(
        `[${notifyId}] Processing SMS delivery job (attempt ${attempt + 1}/3) for tenant=${tenantId}`,
      )

      try {
        // Validate DeliveryJobPayload structure
        if (!notifyId || typeof notifyId !== 'string') {
          throw new Error('Invalid delivery job: notifyId is missing or invalid')
        }
        if (!tenantId || typeof tenantId !== 'string') {
          throw new Error('Invalid delivery job: tenantId is missing or invalid')
        }
        if (typeof attempt !== 'number' || attempt < 0) {
          throw new Error('Invalid delivery job: attempt is missing or invalid')
        }

        // Validate job data
        if (!payload || typeof payload !== 'object') {
          throw new Error('Invalid delivery job: SMS payload is missing or invalid')
        }

        if (
          !payload.recipients ||
          !Array.isArray(payload.recipients) ||
          payload.recipients.length === 0
        ) {
          throw new Error('Invalid SMS payload: recipient phone number is missing or invalid')
        }

        if (!payload.body || typeof payload.body !== 'string') {
          throw new Error('Invalid SMS payload: body is missing or invalid')
        }

        // Update status to SENDING
        await notificationService.update(notifyId, tenantId, {
          status: NotificationStatus.SENDING,
          updatedBy: 'system',
        })
        logger.debug(`[${notifyId}] Updated notification status to SENDING`)

        // Send SMS using the injected adapter
        const result = await SmsDeliveryWorker.sendSmsViaAdapter(
          payload,
          logger,
          notifyId,
          smsAdapter,
        )

        logger.debug(`[${notifyId}] SMS sent successfully: ${JSON.stringify(result)}`)

        // Update status to COMPLETED
        await notificationService.update(notifyId, tenantId, {
          status: NotificationStatus.COMPLETED,
          updatedBy: 'system',
        })
        logger.log(`[${notifyId}] Notification marked as COMPLETED`)

        return { success: true, externalId: result.externalId, provider: result.provider }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error(
          `[${notifyId}] Failed to send SMS delivery job (attempt ${attempt + 1}/3): ${errorMessage}`,
          error instanceof Error ? error.stack : '',
        )

        // Update status to FAILED on final attempt
        if (attempt >= 2) {
          // Last attempt (0, 1, 2 = 3 total attempts)
          await notificationService.update(notifyId, tenantId, {
            status: NotificationStatus.FAILED,
            updatedBy: 'system',
            errorReason: errorMessage,
          })
          logger.error(
            `[${notifyId}] Notification marked as FAILED after 3 attempts. Error: ${errorMessage}`,
          )
        }

        // Re-throw to trigger BullMQ retry logic
        throw error
      }
    })

    // Event listeners for job lifecycle
    smsQueue.on('completed', (job: Bull.Job<DeliveryJobPayload>) => {
      const { notifyId } = job.data
      logger.debug(`[${notifyId}] SMS delivery job completed`)
    })

    smsQueue.on('failed', (job: Bull.Job<DeliveryJobPayload>, err: Error) => {
      const { notifyId } = job.data
      logger.error(
        `[${notifyId}] SMS delivery job failed (attempt ${job.attemptsMade}/${job.opts.attempts}): error=${err.message}`,
      )
    })

    logger.log('SMS delivery worker initialized')
  }

  /**
   * Send SMS via adapter
   * @param payload SMS payload
   * @param logger Logger instance
   * @param notifyId Notification ID for tracing
   * @param smsAdapter SMS transport adapter
   * @returns Promise with send result
   */
  private static async sendSmsViaAdapter(
    payload: any,
    logger: Logger,
    notifyId: string,
    smsAdapter: ISmsTransport,
  ): Promise<{ externalId: string; provider: string }> {
    logger.debug(
      `[${notifyId}] Sending SMS via ${smsAdapter.name} adapter to: ${payload.recipients}`,
    )

    const result = await smsAdapter.send({
      to: payload.recipients,
      body: payload.body,
    })

    return {
      externalId: result.messageId || `${smsAdapter.name}-${Date.now()}`,
      provider: smsAdapter.name,
    }
  }
}
