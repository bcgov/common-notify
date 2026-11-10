import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import type { Job, Queue } from 'bullmq'
import { ConfigService } from '@nestjs/config'
import { IngestionJobPayload, DeliveryJobPayload } from '../queue.types'
import { QueueProcessor } from './queue-processor'
import { QueueName } from '../../enum/queue-name.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { NotificationRequestDetailService } from '../../api/notification/notification-request-detail.service'
import { NotificationService } from '../../api/notification/notification.service'
import { ClamavService } from '../../services/clamav.service'
import { QuarantineDetails } from '../../api/notification/entities/notification-request.entity'
import { AttachmentService } from '../../api/attachment/attachment.service'
import { PhoneNumberService } from '../../api/notify/services/phone-number.service'
import { mergeJobDataFromRequest } from '../merge-batch-builder'
import { DELIVERY_JOB_OPTIONS } from '../job-options'

type IngestionRequest = IngestionJobPayload['request']

function hasAttachmentReferences(
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

function assertIngestionJob({ notifyId, tenantId, requestedAt, request }: IngestionJobPayload) {
  if (!notifyId || typeof notifyId !== 'string') {
    throw new Error('Invalid ingestion job: notifyId is missing or invalid')
  }
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('Invalid ingestion job: tenantId is missing or invalid')
  }
  if (!requestedAt || typeof requestedAt !== 'string') {
    throw new Error('Invalid ingestion job: requestedAt is missing or invalid')
  }
  if (!request || typeof request !== 'object') {
    throw new Error('Invalid request: request payload is missing or invalid')
  }
}

/**
 * Ingestion Worker
 *
 * Turns an accepted request into delivery work: writes one detail row per recipient, scans
 * attachments, and fans out to the channel delivery queues - one job per channel for a plain
 * send, one per BATCH_SIZE recipients for a merge. A scheduled send's delay is on this job, so
 * delivery is queued only once it is due.
 *
 * Idempotency: the job key is the notifyId, and a re-run writes no rows twice.
 */
@Injectable()
export class IngestionWorker implements QueueProcessor<IngestionJobPayload> {
  readonly queueName = QueueName.INGESTION
  readonly concurrency = { configKey: 'ingestionWorkerConcurrency', default: 1 }
  private readonly logger = new Logger(IngestionWorker.name)

  constructor(
    @Inject(QueueName.EMAIL_DELIVERY) private readonly emailQueue: Queue<DeliveryJobPayload>,
    @Inject(QueueName.SMS_DELIVERY) private readonly smsQueue: Queue<DeliveryJobPayload>,
    private readonly notificationService: NotificationService,
    private readonly requestDetailService: NotificationRequestDetailService,
    private readonly configService: ConfigService,
    private readonly phoneNumberService: PhoneNumberService,
    @Optional() private readonly clamavService?: ClamavService,
    @Optional() private readonly attachmentService?: AttachmentService,
  ) {}

  async process(job: Job<IngestionJobPayload>): Promise<unknown> {
    const { notifyId, tenantId } = job.data
    this.logger.debug(`[${notifyId}] Processing ingestion job for tenant=${tenantId}`)

    // Set once ingestion finds rows an earlier run wrote; read by both the success and error paths.
    let resumed = false
    try {
      this.logger.log(`[${notifyId}] [IngestionWorker] Starting to process job ${job.id}`)
      assertIngestionJob(job.data)

      if (job.data.mailMerge && job.data.mailMergeData) {
        return await this.fanOutMerge(job.data)
      }

      const request = this.normalizeSmsRecipients(job.data.request)
      // A re-run (a queue retry, or recovery by the delivery reconciler) finds its rows already
      // written; writing them again would double every recipient.
      resumed = (await this.requestDetailService.countUnbatched(notifyId)) > 0
      if (!resumed) {
        await this.requestDetailService.createPending(notifyId, request, tenantId)
      }

      if (await this.quarantined(notifyId, tenantId, request)) {
        return { success: false, reason: 'Quarantined due to malware detection' }
      }

      const queued = await this.fanOut(job.data, request, resumed)

      await this.notificationService.update(notifyId, tenantId, {
        status: NotificationStatus.PROCESSING,
        updatedBy: 'ingestion-worker',
      })
      // Not on a re-run: some rows are already sent or failed, and a blanket update would mark
      // them in flight again - and the reconciler would then send them twice.
      if (!resumed) {
        await this.requestDetailService.updateStatus(notifyId, NotificationStatus.PROCESSING)
      }

      return { success: true, deliveryJobsQueued: queued }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(
        `[${notifyId}] Failed to process ingestion job: ${errorMessage}`,
        error instanceof Error ? error.stack : '',
      )

      await this.notificationService.update(notifyId, tenantId, {
        status: NotificationStatus.FAILED,
        updatedBy: 'ingestion-worker',
      })
      await this.requestDetailService.updateStatus(notifyId, NotificationStatus.FAILED, {
        preserveCompleted: resumed,
      })

      // Rethrown for the queue's retry policy.
      throw error
    }
  }

  onCompleted(job: Job<IngestionJobPayload>): void {
    this.logger.debug(`[${job.data.notifyId}] Ingestion job completed`)
  }

  onFailed(job: Job<IngestionJobPayload>, error: Error): void {
    this.logger.error(
      `[${job.data.notifyId}] Ingestion job failed (attempt ${job.attemptsMade}/${job.opts.attempts}): error=${error.message}`,
    )
  }

  /**
   * Every recipient of a merge, from the request as stored at acceptance, less those the
   * safelist blocked then (recorded as `blocked` rows). Read here rather than carried on the
   * job, so a large merge is not held in Redis.
   */
  private async loadMergeRecipients(
    notifyId: string,
    tenantId: string,
    channel: NotificationChannel,
  ): Promise<Array<{ address: string; params: Record<string, unknown> }>> {
    const [stored, blocked] = await Promise.all([
      this.notificationService.findOne(notifyId, tenantId),
      this.requestDetailService.findAddressesByStatus(notifyId, 'blocked'),
    ])
    return mergeJobDataFromRequest(
      stored.payload,
      channel,
      (mergeArray, mergeChannel) =>
        this.notificationService.parseMailMergeRecipients(mergeArray, mergeChannel),
      (address) => !blocked.has(address),
    ).recipients!
  }

  /**
   * Split a merge's recipients into fixed-size batches and queue one delivery job per batch on
   * the merge's channel. Each batch's detail rows are written here, tagged with its batchId.
   */
  private async fanOutMerge(data: IngestionJobPayload): Promise<unknown> {
    const { notifyId, tenantId, request } = data
    const { content, params } = data.mailMergeData!
    const batchSize = this.configService?.get<number>('queue.batchSize') || 25
    // Jobs queued before SMS merge existed carry no channel and are email.
    const channel = data.mailMergeChannel ?? NotificationChannel.EMAIL
    const recipients =
      data.mailMergeData!.recipients ??
      (await this.loadMergeRecipients(notifyId, tenantId, channel))
    const queue = channel === NotificationChannel.SMS ? this.smsQueue : this.emailQueue

    this.logger.log(
      `[${notifyId}] Processing ${channel} merge job: ${recipients.length} recipient(s), batchSize=${batchSize}`,
    )

    let batchIndex = 0
    // In order, one batch at a time: each batch's rows are written before its job is queued.
    for (let start = 0; start < recipients.length; start += batchSize, batchIndex++) {
      const chunk = recipients.slice(start, start + batchSize)
      // {notification_request id}-{channel}-{index}, reused as the delivery jobId so a failed
      // batch is easy to identify and retry.
      const batchId = `${notifyId}-${channel}-${batchIndex}`

      // A retried ingestion job re-runs this loop. Rows already written for a batch mean an
      // earlier run created it; writing them again would send those recipients twice.
      if ((await this.requestDetailService.countBatch(notifyId, batchId)) === 0) {
        await this.requestDetailService.createMergePending(
          notifyId,
          batchId,
          chunk,
          channel,
          tenantId,
        )
      }

      const deliveryPayload: DeliveryJobPayload = {
        notifyId,
        tenantId,
        channel,
        request,
        payload: {} as any,
        attempt: 0,
        mailMerge: true,
        batchId,
        // Recipients stay in Postgres; the worker reads this batch's detail rows.
        mailMergeData: { content, params },
      }
      await queue.add(queue.name, deliveryPayload, { jobId: batchId, ...DELIVERY_JOB_OPTIONS })

      this.logger.log(
        `[${notifyId}] Queued mail merge batch ${batchIndex} (batchId=${batchId}, recipients=${chunk.length})`,
      )
    }

    await this.notificationService.update(notifyId, tenantId, {
      status: NotificationStatus.PROCESSING,
      updatedBy: 'ingestion-worker',
    })

    this.logger.log(`[${notifyId}] Mail merge email job fanned out into ${batchIndex} batch(es)`)
    return { success: true, deliveryJobsQueued: batchIndex }
  }

  private normalizeSmsRecipients(request: IngestionRequest): IngestionRequest {
    if (!request.sms?.recipients?.to) return request

    return {
      ...request,
      sms: {
        ...request.sms,
        recipients: {
          ...request.sms.recipients,
          to: request.sms.recipients.to.map(
            (recipient) => this.phoneNumberService.normalize(recipient) ?? recipient,
          ),
        },
      },
    } as IngestionRequest
  }

  /**
   * Scan every attachment for malware. An infected one quarantines the request and nothing is
   * delivered; a scan that cannot run throws, so the job is retried rather than sent unscanned.
   */
  private async quarantined(
    notifyId: string,
    tenantId: string,
    request: IngestionRequest,
  ): Promise<boolean> {
    const attachments = [
      ...(request.email?.attachments ?? []),
      ...(request.sms?.attachments ?? []),
      ...(request.msgApp?.attachments ?? []),
    ]
    if (attachments.length === 0) return false

    if (!this.clamavService) {
      throw new Error('Attachment scan service unavailable')
    }
    if (!hasAttachmentReferences(attachments)) {
      throw new Error('Invalid processed attachment reference payload')
    }
    if (!this.attachmentService) {
      throw new Error('Attachment service unavailable')
    }

    this.logger.log(`[${notifyId}] Scanning ${attachments.length} attachment(s) for malware`)
    // One at a time: each is downloaded in full to scan, and the first infected one ends the scan.
    for (const { attachmentId } of attachments) {
      const quarantine = await this.scanAttachment(notifyId, tenantId, attachmentId)
      if (quarantine) {
        await this.quarantine(notifyId, tenantId, quarantine)
        return true
      }
    }

    this.logger.log(`[${notifyId}] All attachments passed malware scanning`)
    return false
  }

  /** Scan one attachment; the quarantine record when it is infected, else null. */
  private async scanAttachment(
    notifyId: string,
    tenantId: string,
    attachmentId: string,
  ): Promise<QuarantineDetails | null> {
    try {
      const { content, filename } = await this.attachmentService!.downloadAttachmentByIdAndTenantId(
        attachmentId,
        tenantId,
      )
      this.logger.debug(
        `[${notifyId}] Scanning attachment: ${JSON.stringify({
          tenantId,
          attachmentId,
          filename,
          sizeBytes: content.length,
        })}`,
      )

      const scanResult = await this.clamavService!.scanBuffer(content, filename)
      if (!scanResult.isInfected) {
        this.logger.debug(`[${notifyId}] Attachment ${filename || 'unnamed'} passed malware scan`)
        return null
      }

      const viruses = scanResult.quarantineInfo?.viruses || []
      this.logger.warn(
        `[${notifyId}] SECURITY: Malware detected in attachment: ${JSON.stringify({
          tenantId,
          attachmentId,
          filename,
          viruses,
        })}`,
      )
      return {
        viruses,
        filename,
        scannedAt: scanResult.quarantineInfo?.scannedAt
          ? scanResult.quarantineInfo.scannedAt.toISOString()
          : new Date().toISOString(),
        reason: 'Malware detected during attachment scanning',
      }
    } catch (scanError) {
      const errorMsg = scanError instanceof Error ? scanError.message : String(scanError)
      this.logger.error(
        `[${notifyId}] Attachment scan error: ${errorMsg}. Strict mode: retrying job.`,
      )
      throw new Error(`Attachment scan failed: ${errorMsg}`, { cause: scanError })
    }
  }

  private async quarantine(
    notifyId: string,
    tenantId: string,
    quarantineDetails: QuarantineDetails,
  ): Promise<void> {
    await this.notificationService.update(notifyId, tenantId, {
      status: NotificationStatus.QUARANTINED,
      quarantineDetails,
      updatedBy: 'ingestion-worker-scanner',
    })
    await this.requestDetailService.updateStatus(notifyId, NotificationStatus.QUARANTINED)
    this.logger.log(`[${notifyId}] Notification marked as QUARANTINED due to malware detection`)
  }

  /** Queue one delivery job per requested channel; the number queued. */
  private async fanOut(
    { notifyId, tenantId, scheduledFor }: IngestionJobPayload,
    request: IngestionRequest,
    resumed: boolean,
  ): Promise<number> {
    const deliveries: Array<{
      queue: Queue<DeliveryJobPayload>
      channel: NotificationChannel
      payload: any
    }> = []
    if (request.email) {
      this.logger.log(`[${notifyId}] Adding email delivery job`)
      deliveries.push({
        queue: this.emailQueue,
        channel: NotificationChannel.EMAIL,
        payload: request.email,
      })
    }
    if (request.sms) {
      this.logger.log(`[${notifyId}] Adding SMS delivery job`)
      deliveries.push({
        queue: this.smsQueue,
        channel: NotificationChannel.SMS,
        payload: request.sms,
      })
    }
    // validateBusinessRules() guarantees a channel before the request is queued.
    if (deliveries.length === 0) {
      throw new Error(
        'No delivery channels specified - this should have been caught by validateBusinessRules',
      )
    }

    // Calculated for scheduled sends; the queue ignores a delay of 0.
    const delay = scheduledFor ? Math.max(0, new Date(scheduledFor).getTime() - Date.now()) : 0
    const scheduleInfo =
      delay > 0 ? ` (scheduled for ${new Date(scheduledFor!).toISOString()})` : ''

    // Email and SMS are independent, so they are queued together.
    const queueChannel = async ({ queue, channel, payload }: (typeof deliveries)[number]) => {
      // On a re-run, a channel whose recipients are all sent or failed is done; queueing it
      // again would re-send it while recovering the other channel.
      if (resumed && (await this.requestDetailService.countInFlight(notifyId, channel)) === 0) {
        this.logger.log(`[${notifyId}] Skipping ${channel}: delivered on an earlier run`)
        return
      }

      // notifyId_channel: a retried ingestion job cannot queue the same delivery twice.
      const jobKey = `${notifyId}_${channel}`
      const deliveryPayload: DeliveryJobPayload = {
        notifyId,
        tenantId,
        channel,
        request,
        payload,
        attempt: 0,
      }
      await queue.add(queue.name, deliveryPayload, {
        jobId: jobKey,
        delay,
        ...DELIVERY_JOB_OPTIONS,
      })

      this.logger.log(
        `[${notifyId}] Queued delivery job (channel=${channel}, key=${jobKey})${scheduleInfo}`,
      )
    }
    await Promise.all(deliveries.map(queueChannel))

    this.logger.log(
      `[${notifyId}] Successfully processed ingestion job, channels=${deliveries.map((d) => d.channel).join(',')}`,
    )
    return deliveries.length
  }
}
