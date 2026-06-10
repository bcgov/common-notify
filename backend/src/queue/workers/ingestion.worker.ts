import { Logger } from '@nestjs/common'
import Bull from 'bull'
import { ConfigService } from '@nestjs/config'
import { IngestionJobPayload, DeliveryJobPayload } from '../queue.types'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { NotificationService } from '../../api/notification/notification.service'
import { ClamavService } from '../../services/clamav.service'
import { QuarantineDetails } from '../../api/notification/entities/notification-request.entity'

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
   * @param clamavService Service for malware scanning
   * @param concurrency Number of jobs to process in parallel (default: 1)
   */
  static async initialize(
    ingestionQueue: Bull.Queue<IngestionJobPayload>,
    emailQueue: Bull.Queue<DeliveryJobPayload>,
    smsQueue: Bull.Queue<DeliveryJobPayload>,
    notificationService: NotificationService,
    configService: ConfigService,
    clamavService?: ClamavService,
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

        // Scan email attachments for malware
        if (request.email?.attachments && request.email.attachments.length > 0) {
          if (!clamavService) {
            throw new Error('Attachment scan service unavailable')
          }

          logger.log(
            `[${notifyId}] Scanning ${request.email.attachments.length} email attachment(s) for malware`,
          )

          for (const attachment of request.email.attachments) {
            // Skip attachments without content
            if (!attachment.content) {
              logger.debug(`[${notifyId}] Skipping attachment without content`)
              continue
            }

            try {
              // Convert base64 content to Buffer for scanning
              let buffer: Buffer
              try {
                buffer = Buffer.from(attachment.content, 'base64')
              } catch {
                // If base64 decode fails, treat as raw content
                buffer = Buffer.from(attachment.content, 'utf-8')
              }

              logger.debug(
                `[${notifyId}] Scanning attachment: ${attachment.filename || 'unnamed'} (${buffer.length} bytes)`,
              )

              // Scan buffer for malware using CLAMD protocol
              const scanResult = await clamavService.scanBuffer(buffer, attachment.filename)

              if (scanResult.isInfected) {
                // Malware detected - quarantine the notification
                logger.warn(
                  `[${notifyId}] SECURITY: Malware detected in attachment: ${attachment.filename || 'unnamed'}. Viruses: ${scanResult.quarantineInfo?.viruses.join(', ')}`,
                )

                // Create quarantine details from scan result
                const quarantineDetails: QuarantineDetails = {
                  viruses: scanResult.quarantineInfo?.viruses || [],
                  filename: attachment.filename,
                  scannedAt: scanResult.quarantineInfo?.scannedAt
                    ? scanResult.quarantineInfo.scannedAt.toISOString()
                    : new Date().toISOString(),
                  reason: 'Malware detected during attachment scanning',
                }

                // Update notification to QUARANTINED status
                await notificationService.update(notifyId, tenantId, {
                  status: NotificationStatus.QUARANTINED,
                  quarantineDetails,
                  updatedBy: 'ingestion-worker-scanner',
                })

                logger.log(
                  `[${notifyId}] Notification marked as QUARANTINED due to malware detection`,
                )

                // Stop processing - do not queue delivery jobs
                return { success: false, reason: 'Quarantined due to malware detection' }
              }

              logger.debug(
                `[${notifyId}] Attachment ${attachment.filename || 'unnamed'} passed malware scan`,
              )
            } catch (scanError) {
              const errorMsg = scanError instanceof Error ? scanError.message : String(scanError)
              logger.error(
                `[${notifyId}] Attachment scan error: ${errorMsg}. Strict mode: retrying job.`,
              )
              // Strict mode: throw error to trigger BullMQ retry if ClamAV is unavailable
              throw new Error(`Attachment scan failed: ${errorMsg}`)
            }
          }

          logger.log(`[${notifyId}] All attachments passed malware scanning`)
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
            request, // Include original request so delivery workers can resolve templates
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
