import { Logger } from '@nestjs/common'
import Bull from 'bull'
import { DeliveryJobPayload } from '../queue.types'
import { NotificationService } from '../../notification/notification.service'
import { NotificationStatus } from '../../notification/schemas'

/**
 * Email Delivery Worker
 *
 * Processes email delivery jobs:
 * 1. Receives email delivery jobs from the EMAIL_DELIVERY queue
 * 2. Updates notification status to SENDING in database
 * 3. Gets the appropriate adapter (currently CHES, future: GC Notify)
 * 4. Sends email via adapter
 * 5. Updates notification status to COMPLETED on success, FAILED on error
 * 6. Implements retry logic with exponential backoff
 *
 * Idempotency: Job key is notifyId_email, preventing duplicate delivery
 * Tracing: All operations logged with recordId for end-to-end visibility
 */
export class EmailDeliveryWorker {
  private readonly logger = new Logger(EmailDeliveryWorker.name)

  /**
   * Initialize the email delivery worker on a queue
   * @param emailQueue The BullMQ queue instance for email delivery jobs
   * @param notificationService Service for database updates
   * @param concurrency Number of jobs to process in parallel (default: 2)
   */
  static async initialize(
    emailQueue: Bull.Queue<DeliveryJobPayload>,
    notificationService: NotificationService,
    concurrency: number = 2,
  ): Promise<void> {
    const logger = new Logger(EmailDeliveryWorker.name)

    logger.log(`Registering email delivery worker processor (concurrency=${concurrency})`)

    // Register the job processor with configurable concurrency
    // Note: Don't await process() - it sets up listeners and never resolves
    emailQueue.process(concurrency, async (job: Bull.Job<DeliveryJobPayload>) => {
      const { notifyId, recordId, tenantId, payload, attempt } = job.data

      logger.debug(
        `[${recordId}] Processing email delivery job (attempt ${attempt + 1}/3) for notifyId=${notifyId}, tenant=${tenantId}`,
      )

      try {
        // Validate DeliveryJobPayload structure
        if (!notifyId || typeof notifyId !== 'string') {
          throw new Error('Invalid delivery job: notifyId is missing or invalid')
        }
        if (!recordId || typeof recordId !== 'string') {
          throw new Error('Invalid delivery job: recordId is missing or invalid')
        }
        if (!tenantId || typeof tenantId !== 'string') {
          throw new Error('Invalid delivery job: tenantId is missing or invalid')
        }
        if (typeof attempt !== 'number' || attempt < 0) {
          throw new Error('Invalid delivery job: attempt is missing or invalid')
        }

        // Validate job data
        if (!payload || typeof payload !== 'object') {
          throw new Error('Invalid delivery job: email payload is missing or invalid')
        }

        if (!payload.to || !Array.isArray(payload.to) || payload.to.length === 0) {
          throw new Error('Invalid email payload: recipient email address is missing or invalid')
        }

        if (!payload.subject || typeof payload.subject !== 'string') {
          throw new Error('Invalid email payload: subject is missing or invalid')
        }

        if (!payload.body || typeof payload.body !== 'string') {
          throw new Error('Invalid email payload: body is missing or invalid')
        }

        // Update status to SENDING
        await notificationService.update(recordId, tenantId, {
          status: NotificationStatus.SENDING,
          updatedBy: 'system',
        })
        logger.debug(`[${recordId}] Updated notification status to SENDING`)

        // TODO: Get adapter instance from factory
        // const adapter = NotificationAdapterFactory.getAdapter(request)
        // For now, we'll return a success response to allow testing
        const result = await EmailDeliveryWorker.sendEmailViaAdapter(payload, logger, recordId)

        logger.debug(`[${recordId}] Email sent successfully: ${JSON.stringify(result)}`)

        // Update status to COMPLETED
        await notificationService.update(recordId, tenantId, {
          status: NotificationStatus.COMPLETED,
          updatedBy: 'system',
        })
        logger.log(`[${recordId}] Notification marked as COMPLETED`)

        return { success: true, externalId: result.externalId, provider: result.provider }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error(
          `[${recordId}] Failed to send email delivery job for notifyId=${notifyId} (attempt ${attempt + 1}/3): ${errorMessage}`,
          error instanceof Error ? error.stack : '',
        )

        // Update status to FAILED on final attempt
        if (attempt >= 2) {
          // Last attempt (0, 1, 2 = 3 total attempts)
          await notificationService.update(recordId, tenantId, {
            status: NotificationStatus.FAILED,
            updatedBy: 'system',
          })
          logger.error(
            `[${recordId}] Notification marked as FAILED after 3 attempts. Error: ${errorMessage}`,
          )
        }

        // Re-throw to trigger BullMQ retry logic
        throw error
      }
    })

    // Event listeners for job lifecycle
    emailQueue.on('completed', (job: Bull.Job<DeliveryJobPayload>) => {
      const { notifyId, recordId } = job.data
      logger.debug(`[${recordId}] Email delivery job completed: notifyId=${notifyId}`)
    })

    emailQueue.on('failed', (job: Bull.Job<DeliveryJobPayload>, err: Error) => {
      const { notifyId, recordId } = job.data
      logger.error(
        `[${recordId}] Email delivery job failed (attempt ${job.attemptsMade}/${job.opts.attempts}): notifyId=${notifyId}, error=${err.message}`,
      )
    })

    logger.log('Email delivery worker initialized')
  }

  /**
   * Send email via adapter (mock implementation for now)
   * TODO: Replace with actual adapter.sendEmail() call
   * @param payload Email payload
   * @param logger Logger instance
   * @param recordId Record ID for tracing
   * @returns Promise with send result
   */
  private static async sendEmailViaAdapter(
    payload: any,
    logger: Logger,
    recordId: string,
  ): Promise<{ externalId: string; provider: string }> {
    // TODO: Implement actual adapter call
    // Example implementation when adapter is ready:
    // const adapter = NotificationAdapterFactory.getAdapter(request)
    // const result = await adapter.sendEmail(payload)
    // return { externalId: result.txId, provider: result.provider }

    // For now, simulate successful send
    logger.debug(
      `[${recordId}] Simulating email send to: ${Array.isArray(payload.to) ? payload.to.join(', ') : payload.to}`,
    )

    return {
      externalId: `ches-${Date.now()}`,
      provider: 'ches',
    }
  }
}
