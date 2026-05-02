import { Logger } from '@nestjs/common'
import Bull from 'bull'
import { ConfigService } from '@nestjs/config'
import { DeliveryJobPayload } from '../queue.types'
import { NotificationService } from '../../api/notification/notification.service'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { NotifyEmailChannel } from '../../api/notify/schemas/notify-email-channel'
import { IEmailTransport } from '../../adapters'

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
 * Tracing: All operations logged with notifyId for end-to-end visibility
 */
export class EmailDeliveryWorker {
  private readonly logger = new Logger(EmailDeliveryWorker.name)

  /**
   * Initialize the email delivery worker on a queue
   * @param emailQueue The BullMQ queue instance for email delivery jobs
   * @param notificationService Service for database updates
   * @param configService Configuration service for queue settings
   * @param emailAdapter Email transport adapter for sending emails
   * @param concurrency Number of jobs to process in parallel (default: 2)
   */
  static async initialize(
    emailQueue: Bull.Queue<DeliveryJobPayload>,
    notificationService: NotificationService,
    configService: ConfigService,
    emailAdapter: IEmailTransport,
    concurrency: number = 2,
  ): Promise<void> {
    const logger = new Logger(EmailDeliveryWorker.name)

    logger.log(`Registering email delivery worker processor (concurrency=${concurrency})`)

    // Register the job processor with configurable concurrency
    // Note: Don't await process() - it sets up listeners and never resolves
    emailQueue.process(concurrency, async (job: Bull.Job<DeliveryJobPayload>) => {
      const { notifyId, tenantId, payload, attempt } = job.data

      logger.debug(
        `[${notifyId}] Processing email delivery job (attempt ${attempt + 1}/3) for tenant=${tenantId}`,
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
          throw new Error('Invalid delivery job: email payload is missing or invalid')
        }

        // Cast payload to email channel type for type safety
        const emailPayload = payload as NotifyEmailChannel

        if (
          !emailPayload.recipients ||
          !Array.isArray(emailPayload.recipients) ||
          emailPayload.recipients.length === 0
        ) {
          throw new Error('Invalid email payload: recipient email address is missing or invalid')
        }

        if (!emailPayload.subject || typeof emailPayload.subject !== 'string') {
          throw new Error('Invalid email payload: subject is missing or invalid')
        }

        if (!emailPayload.body || typeof emailPayload.body !== 'string') {
          throw new Error('Invalid email payload: body is missing or invalid')
        }

        // Update status to SENDING
        await notificationService.update(notifyId, tenantId, {
          status: NotificationStatus.SENDING,
          updatedBy: 'system',
        })
        logger.debug(`[${notifyId}] Updated notification status to SENDING`)

        // Send email using the injected adapter
        const result = await EmailDeliveryWorker.sendEmail(
          emailPayload,
          logger,
          notifyId,
          emailAdapter,
        )

        logger.debug(`[${notifyId}] Email sent successfully: ${JSON.stringify(result)}`)

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
          `[${notifyId}] Failed to send email delivery job (attempt ${attempt + 1}/3): ${errorMessage}`,
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
    emailQueue.on('completed', (job: Bull.Job<DeliveryJobPayload>) => {
      const { notifyId } = job.data
      logger.debug(`[${notifyId}] Email delivery job completed`)
    })

    emailQueue.on('failed', (job: Bull.Job<DeliveryJobPayload>, err: Error) => {
      const { notifyId } = job.data
      logger.error(
        `[${notifyId}] Email delivery job failed (attempt ${job.attemptsMade}/${job.opts.attempts}): error=${err.message}`,
      )
    })

    logger.log('Email delivery worker initialized')
  }

  /**
   * Send email via adapter
   * @param payload Email payload
   * @param logger Logger instance
   * @param notifyId Notification ID for tracing
   * @param emailAdapter Email transport adapter
   * @returns Promise with send result
   */
  private static async sendEmail(
    payload: NotifyEmailChannel,
    logger: Logger,
    notifyId: string,
    emailAdapter: IEmailTransport,
  ): Promise<{ externalId: string; provider: string }> {
    logger.debug(
      `[${notifyId}] Sending email via ${emailAdapter.name} adapter to: ${Array.isArray(payload.recipients) ? payload.recipients.join(', ') : payload.recipients}`,
    )

    const result = await emailAdapter.send({
      to: Array.isArray(payload.recipients) ? payload.recipients.join(', ') : payload.recipients,
      subject: payload.subject,
      body: payload.body,
      ...(payload.attachments && {
        attachments: payload.attachments
          .filter((a) => a.filename && a.content)
          .map(({ content, filename }) => ({
            filename: filename!,
            content: content!,
            sendingMethod: 'attach' as const,
          })),
      }),
    })

    return {
      externalId: result.messageId || `${emailAdapter.name}-${Date.now()}`,
      provider: emailAdapter.name,
    }
  }
}
