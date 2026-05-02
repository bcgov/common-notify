import { Logger } from '@nestjs/common'
import Bull from 'bull'
import { ConfigService } from '@nestjs/config'
import { IngestionJobPayload, DeliveryJobPayload } from '../queue.types'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { NotificationService } from '../../api/notification/notification.service'

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
   * @param notificationService Service for database updates
   * @param configService Configuration service for queue settings
   * @param concurrency Number of jobs to process in parallel (default: 1)
   */
  static async initialize(
    ingestionQueue: Bull.Queue<IngestionJobPayload>,
    emailQueue: Bull.Queue<DeliveryJobPayload>,
    smsQueue: Bull.Queue<DeliveryJobPayload>,
    notificationService: NotificationService,
    configService: ConfigService,
    concurrency: number = 1,
  ): Promise<void> {
    const logger = new Logger(IngestionWorker.name)

    logger.log(`Registering ingestion worker processor (concurrency=${concurrency})`)
    logger.log(
      `Queue check - ingestion: ${!!ingestionQueue}, email: ${!!emailQueue}, sms: ${!!smsQueue}`,
    )

    // Register the job processor with configurable concurrency
    ingestionQueue.process(concurrency, async (job: Bull.Job<IngestionJobPayload>) => {
      const { notifyId, tenantId, request, scheduledFor, requestedAt } = job.data

      logger.debug(`[${notifyId}] Processing ingestion job for tenant=${tenantId}`)

      try {
        logger.log(`[${notifyId}] [IngestionWorker] Starting to process job ${job.id}`)

        // Validate IngestionJobPayload structure
        if (!notifyId || typeof notifyId !== 'string') {
          throw new Error('Invalid ingestion job: notifyId is missing or invalid')
        }
        if (!tenantId || typeof tenantId !== 'string') {
          throw new Error('Invalid ingestion job: tenantId is missing or invalid')
        }
        if (!requestedAt || typeof requestedAt !== 'string') {
          throw new Error('Invalid ingestion job: requestedAt is missing or invalid')
        }

        // Validate request structure
        if (!request || typeof request !== 'object') {
          throw new Error('Invalid request: request payload is missing or invalid')
        }

        // Determine channels and fan-out to delivery queues
        const deliveryJobs: Array<{
          queue: Bull.Queue<DeliveryJobPayload>
          channel: NotificationChannel
          payload: any
        }> = []

        // Email channel
        if (request.email) {
          logger.log(`[${notifyId}] Adding email delivery job`)
          deliveryJobs.push({
            queue: emailQueue,
            channel: NotificationChannel.EMAIL,
            payload: request.email,
          })
        }

        // SMS channel
        if (request.sms) {
          logger.log(`[${notifyId}] Adding SMS delivery job`)
          deliveryJobs.push({
            queue: smsQueue,
            channel: NotificationChannel.SMS,
            payload: request.sms,
          })
        }

        // Note: At least one channel is guaranteed by validateBusinessRules()
        // which runs before this job is queued, so this should never be empty
        if (deliveryJobs.length === 0) {
          throw new Error(
            'No delivery channels specified - this should have been caught by validateBusinessRules',
          )
        }

        // Queue delivery jobs with idempotency and tracing
        for (const { queue, channel, payload } of deliveryJobs) {
          const deliveryPayload: DeliveryJobPayload = {
            notifyId,
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

          logger.log(
            `[${notifyId}] Queued delivery job (channel=${channel}, key=${jobKey})${scheduleInfo}`,
          )
        }

        logger.log(
          `[${notifyId}] Successfully processed ingestion job, channels=${deliveryJobs.map((d) => d.channel).join(',')}`,
        )

        // Update notification_request status to PROCESSING in database
        await notificationService.update(notifyId, tenantId, {
          status: NotificationStatus.PROCESSING,
          updatedBy: 'ingestion-worker',
        })

        return { success: true, deliveryJobsQueued: deliveryJobs.length }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error(
          `[${notifyId}] Failed to process ingestion job: ${errorMessage}`,
          error instanceof Error ? error.stack : '',
        )

        // Update notification_request status to FAILED in database
        await notificationService.update(notifyId, tenantId, {
          status: NotificationStatus.FAILED,
          updatedBy: 'ingestion-worker',
        })

        // Re-throw to trigger BullMQ retry logic
        throw error
      }
    })

    logger.log('Ingestion worker processor registered successfully')

    // Event listeners for job lifecycle
    ingestionQueue.on('completed', (job: Bull.Job<IngestionJobPayload>) => {
      const { notifyId } = job.data
      logger.debug(`[${notifyId}] Ingestion job completed`)
    })

    ingestionQueue.on('failed', (job: Bull.Job<IngestionJobPayload>, err: Error) => {
      const { notifyId } = job.data
      logger.error(
        `[${notifyId}] Ingestion job failed (attempt ${job.attemptsMade}/${job.opts.attempts}): error=${err.message}`,
      )
    })

    logger.log('Ingestion worker initialized')
  }
}
