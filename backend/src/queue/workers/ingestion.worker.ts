import { Logger } from '@nestjs/common'
import Bull from 'bull'
import { ConfigService } from '@nestjs/config'
import { IngestionJobPayload, DeliveryJobPayload } from '../queue.types'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { NotificationRequestDetailService } from '../../api/notification/notification-request-detail.service'
import { NotificationService } from '../../api/notification/notification.service'
import { ClamavService } from '../../services/clamav.service'
import { QuarantineDetails } from '../../api/notification/entities/notification-request.entity'
import { AttachmentService } from '../../api/attachment/attachment.service'
import { PhoneNumberService } from '../../api/notify/services/phone-number.service'
import { mergeJobDataFromRequest } from '../merge-batch-builder'
import { FAILED_JOB_RETENTION } from '../job-retention'

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
   * Every recipient of a merge, from the request as stored at acceptance, less those the
   * safelist blocked then (recorded as `blocked` rows). Read here rather than carried on the
   * job, so a large merge is not held in Redis.
   */
  static async loadMergeRecipients(
    notifyId: string,
    tenantId: string,
    channel: NotificationChannel,
    notificationService: NotificationService,
    requestDetailService: NotificationRequestDetailService,
  ): Promise<Array<{ address: string; params: Record<string, unknown> }>> {
    const [stored, blocked] = await Promise.all([
      notificationService.findOne(notifyId, tenantId),
      requestDetailService.findAddressesByStatus(notifyId, 'blocked'),
    ])
    return mergeJobDataFromRequest(
      stored.payload,
      channel,
      (mergeArray, mergeChannel) =>
        notificationService.parseMailMergeRecipients(mergeArray, mergeChannel),
      (address) => !blocked.has(address),
    ).recipients!
  }

  private static normalizeSmsRecipients(
    request: IngestionJobPayload['request'],
    phoneNumberService: PhoneNumberService,
  ): IngestionJobPayload['request'] {
    if (!request.sms?.recipients?.to) return request

    return {
      ...request,
      sms: {
        ...request.sms,
        recipients: {
          ...request.sms.recipients,
          to: request.sms.recipients.to.map(
            (recipient) => phoneNumberService.normalize(recipient) ?? recipient,
          ),
        },
      },
    } as IngestionJobPayload['request']
  }

  private static hasAttachmentReferences(
    attachments: unknown,
  ): attachments is Array<{ attachmentId: string }> {
    return (
      Array.isArray(attachments) &&
      attachments.every(
        (attachment) =>
          attachment &&
          typeof attachment === 'object' &&
          typeof (attachment as { attachmentId?: unknown }).attachmentId === 'string',
      )
    )
  }

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
    requestDetailService: NotificationRequestDetailService,
    configService: ConfigService,
    clamavService?: ClamavService,
    concurrency: number = 1,
    attachmentService?: AttachmentService,
    phoneNumberService: PhoneNumberService = new PhoneNumberService(),
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

      // Set once ingestion finds rows an earlier run wrote; read by both the success and error paths.
      let resumed = false
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
        let processedRequest

        // Mail merge email send: split recipients into fixed-size batches and fan out one
        // email-delivery job per batch. Detail rows are created here, tagged with a batchId.
        if (job.data.mailMerge && job.data.mailMergeData) {
          const { content, params } = job.data.mailMergeData
          const batchSize = configService?.get<number>('queue.batchSize') || 25
          // Older jobs queued before SMS merge existed carry no channel and are email.
          const mergeChannel = job.data.mailMergeChannel ?? NotificationChannel.EMAIL
          const recipients =
            job.data.mailMergeData.recipients ??
            (await IngestionWorker.loadMergeRecipients(
              notifyId,
              tenantId,
              mergeChannel,
              notificationService,
              requestDetailService,
            ))
          const isSmsMerge = mergeChannel === NotificationChannel.SMS
          const mergeQueue = isSmsMerge ? smsQueue : emailQueue

          logger.log(
            `[${notifyId}] Processing ${mergeChannel} merge job: ${recipients.length} recipient(s), batchSize=${batchSize}`,
          )

          let batchIndex = 0
          for (let start = 0; start < recipients.length; start += batchSize) {
            const chunk = recipients.slice(start, start + batchSize)
            // Format: {notification_request id}-{channel}-{index}; reused as the delivery jobId
            // so a failed batch is easy to identify and retry.
            const batchId = `${notifyId}-${mergeChannel}-${batchIndex}`

            // A retried ingestion job re-runs this loop. Rows already written for a batch mean an
            // earlier run created it; writing them again would send those recipients twice.
            if ((await requestDetailService.countBatch(notifyId, batchId)) === 0) {
              await requestDetailService.createMergePending(
                notifyId,
                batchId,
                chunk,
                mergeChannel,
                tenantId,
              )
            }

            const deliveryPayload: DeliveryJobPayload = {
              notifyId,
              tenantId,
              channel: mergeChannel,
              request,
              payload: {} as any,
              attempt: 0,
              mailMerge: true,
              batchId,
              // Recipients stay in Postgres; the worker reads this batch's detail rows.
              mailMergeData: { content, params },
            }

            await mergeQueue.add(deliveryPayload, {
              jobId: batchId,
              removeOnComplete: true,
              removeOnFail: FAILED_JOB_RETENTION,
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            })

            logger.log(
              `[${notifyId}] Queued mail merge batch ${batchIndex} (batchId=${batchId}, recipients=${chunk.length})`,
            )
            batchIndex++
          }

          await notificationService.update(notifyId, tenantId, {
            status: NotificationStatus.PROCESSING,
            updatedBy: 'ingestion-worker',
          })

          logger.log(`[${notifyId}] Mail merge email job fanned out into ${batchIndex} batch(es)`)
          return { success: true, deliveryJobsQueued: batchIndex }
        } else {
          processedRequest = IngestionWorker.normalizeSmsRecipients(request, phoneNumberService)

          // A re-run (Bull retry, or recovery by the delivery reconciler) finds its rows already
          // written; writing them again would double every recipient.
          resumed = (await requestDetailService.countUnbatched(notifyId)) > 0
          if (!resumed) {
            await requestDetailService.createPending(notifyId, processedRequest, tenantId)
          }
        }

        const channelAttachments = [
          ...(processedRequest.email?.attachments ?? []),
          ...(processedRequest.sms?.attachments ?? []),
          ...(processedRequest.msgApp?.attachments ?? []),
        ]

        if (channelAttachments.length > 0) {
          if (!clamavService) {
            throw new Error('Attachment scan service unavailable')
          }
          if (!IngestionWorker.hasAttachmentReferences(channelAttachments)) {
            throw new Error('Invalid processed attachment reference payload')
          }
          if (!attachmentService) {
            throw new Error('Attachment service unavailable')
          }

          logger.log(
            `[${notifyId}] Scanning ${channelAttachments.length} attachment(s) for malware`,
          )

          for (const attachment of channelAttachments) {
            try {
              const downloadedAttachment =
                await attachmentService.downloadAttachmentByIdAndTenantId(
                  attachment.attachmentId,
                  tenantId,
                )
              const buffer = downloadedAttachment.content
              const attachmentFilename = downloadedAttachment.filename

              logger.debug(
                `[${notifyId}] Scanning attachment: ${JSON.stringify({
                  tenantId,
                  attachmentId: attachment.attachmentId,
                  filename: attachmentFilename,
                  sizeBytes: buffer.length,
                })}`,
              )

              // Scan buffer for malware using CLAMD protocol
              const scanResult = await clamavService.scanBuffer(buffer, attachmentFilename)

              if (scanResult.isInfected) {
                // Malware detected - quarantine the notification
                logger.warn(
                  `[${notifyId}] SECURITY: Malware detected in attachment: ${JSON.stringify({
                    tenantId,
                    attachmentId: attachment.attachmentId,
                    filename: attachmentFilename,
                    viruses: scanResult.quarantineInfo?.viruses || [],
                  })}`,
                )

                // Create quarantine details from scan result
                const quarantineDetails: QuarantineDetails = {
                  viruses: scanResult.quarantineInfo?.viruses || [],
                  filename: attachmentFilename,
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
                await requestDetailService.updateStatus(notifyId, NotificationStatus.QUARANTINED)

                logger.log(
                  `[${notifyId}] Notification marked as QUARANTINED due to malware detection`,
                )

                // Stop processing - do not queue delivery jobs
                return { success: false, reason: 'Quarantined due to malware detection' }
              }

              logger.debug(
                `[${notifyId}] Attachment ${attachmentFilename || 'unnamed'} passed malware scan`,
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
        if (processedRequest.email) {
          logger.log(`[${notifyId}] Adding email delivery job`)
          deliveryJobs.push({
            queue: emailQueue,
            channel: NotificationChannel.EMAIL,
            payload: processedRequest.email,
          })
        }

        // SMS channel
        if (processedRequest.sms) {
          logger.log(`[${notifyId}] Adding SMS delivery job`)
          deliveryJobs.push({
            queue: smsQueue,
            channel: NotificationChannel.SMS,
            payload: processedRequest.sms,
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
          // On a re-run, a channel whose recipients are all sent or failed is done; queueing it
          // again would re-send it while recovering the other channel.
          if (resumed && (await requestDetailService.countInFlight(notifyId, channel)) === 0) {
            logger.log(`[${notifyId}] Skipping ${channel}: delivered on an earlier run`)
            continue
          }

          const deliveryPayload: DeliveryJobPayload = {
            notifyId,
            tenantId,
            channel,
            request: processedRequest,
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
            removeOnFail: FAILED_JOB_RETENTION,
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

        // Not on a re-run: some rows are already sent or failed, and a blanket update would mark
        // them in flight again - and the reconciler would then send them twice.
        if (!resumed) {
          await requestDetailService.updateStatus(notifyId, NotificationStatus.PROCESSING)
        }

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
        await requestDetailService.updateStatus(notifyId, NotificationStatus.FAILED, {
          preserveCompleted: resumed,
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
