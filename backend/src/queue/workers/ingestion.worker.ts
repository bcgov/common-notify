import { Logger } from '@nestjs/common'
import Bull from 'bull'
import { IngestionJobPayload, DeliveryJobPayload } from '../queue.types'
import { NotificationChannel } from '../../enum/notification-channel.enum'

/**
 * Ingestion Worker
 *
 * Orchestrates notification processing:
 * 1. Receives notification requests from the ingestion queue
 * 2. Validates and determines which channels are requested (email, SMS)
 * 3. Fans out to channel-specific delivery queues
 * 4. Updates notification status in database
 *
 * Idempotency: Job key is notifyId, preventing duplicate processing
 * Tracing: All operations logged with correlationId for end-to-end visibility
 */
export class IngestionWorker {
  private readonly logger = new Logger(IngestionWorker.name)

  /**
   * Initialize the ingestion worker on a queue
   * @param ingestionQueue The BullMQ queue instance for ingestion jobs
   * @param emailQueue Queue for email delivery jobs
   * @param smsQueue Queue for SMS delivery jobs
   */
  static async initialize(
    ingestionQueue: Bull.Queue<IngestionJobPayload>,
    emailQueue: Bull.Queue<DeliveryJobPayload>,
    smsQueue: Bull.Queue<DeliveryJobPayload>,
  ): Promise<void> {
    const logger = new Logger(IngestionWorker.name)

    // Register the job processor
    await ingestionQueue.process(async (job: Bull.Job<IngestionJobPayload>) => {
      const { notifyId, correlationId, tenantId, request, scheduledFor } = job.data

      logger.debug(
        `[${correlationId}] Processing ingestion job for notifyId=${notifyId}, tenant=${tenantId}`,
      )

      try {
        // Validate request structure
        if (!request) {
          throw new Error('Invalid request: request payload is missing')
        }

        // Determine channels and fan-out to delivery queues
        const deliveryJobs: Array<{
          queue: Bull.Queue<DeliveryJobPayload>
          channel: NotificationChannel
          payload: any
        }> = []

        // Email channel
        if (request.email) {
          logger.debug(`[${correlationId}] Adding email delivery job for notifyId=${notifyId}`)
          deliveryJobs.push({
            queue: emailQueue,
            channel: NotificationChannel.EMAIL,
            payload: request.email,
          })
        }

        // SMS channel
        if (request.sms) {
          logger.debug(`[${correlationId}] Adding SMS delivery job for notifyId=${notifyId}`)
          deliveryJobs.push({
            queue: smsQueue,
            channel: NotificationChannel.SMS,
            payload: request.sms,
          })
        }

        // Ensure at least one channel is specified
        if (deliveryJobs.length === 0) {
          throw new Error('No delivery channels specified (email or sms must be present)')
        }

        // Queue delivery jobs with idempotency and tracing
        for (const { queue, channel, payload } of deliveryJobs) {
          const deliveryPayload: DeliveryJobPayload = {
            notifyId,
            correlationId,
            tenantId,
            channel,
            payload,
            attempt: 0,
          }

          // Add job with notifyId_channel as key for idempotency
          // (prevents duplicate delivery if ingestion job is retried)
          const jobKey = `${notifyId}_${channel}`

          // Calculate delay for scheduled sends
          const delay = scheduledFor ? new Date(scheduledFor).getTime() - Date.now() : 0
          const isScheduled = delay > 0

          await queue.add(deliveryPayload, {
            jobId: jobKey,
            delay: Math.max(0, delay), // BullMQ ignores negative delays
            removeOnComplete: true,
            removeOnFail: false, // Keep failed jobs for debugging
            attempts: 3, // Retry up to 3 times
            backoff: {
              type: 'exponential',
              delay: 2000, // Start with 2s, exponential backoff
            },
          })

          const scheduleInfo = isScheduled
            ? ` (scheduled for ${new Date(scheduledFor).toISOString()})`
            : ''

          logger.debug(
            `[${correlationId}] Queued delivery job (channel=${channel}, key=${jobKey})${scheduleInfo}`,
          )
        }

        logger.log(
          `[${correlationId}] Successfully processed ingestion job for notifyId=${notifyId}, channels=${deliveryJobs.map((d) => d.channel).join(',')}`,
        )

        // TODO: Update notification_request status to PROCESSING in database
        // await notificationRepository.update(notifyId, { status: NotificationStatus.PROCESSING })

        return { success: true, deliveryJobsQueued: deliveryJobs.length }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error(
          `[${correlationId}] Failed to process ingestion job for notifyId=${notifyId}: ${errorMessage}`,
          error instanceof Error ? error.stack : '',
        )

        // TODO: Update notification_request status to FAILED in database
        // await notificationRepository.update(notifyId, {
        //   status: NotificationStatus.FAILED,
        //   errorReason: errorMessage,
        // })

        // Re-throw to trigger BullMQ retry logic
        throw error
      }
    })

    // Event listeners for job lifecycle
    ingestionQueue.on('completed', (job: Bull.Job<IngestionJobPayload>) => {
      const { correlationId, notifyId } = job.data
      logger.debug(`[${correlationId}] Ingestion job completed: notifyId=${notifyId}`)
    })

    ingestionQueue.on('failed', (job: Bull.Job<IngestionJobPayload>, err: Error) => {
      const { correlationId, notifyId } = job.data
      logger.error(
        `[${correlationId}] Ingestion job failed (attempt ${job.attemptsMade}/${job.opts.attempts}): notifyId=${notifyId}, error=${err.message}`,
      )
    })

    logger.log('Ingestion worker initialized')
  }
}
