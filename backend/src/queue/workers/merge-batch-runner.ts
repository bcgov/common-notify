import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { describeError } from '../../common/utils/describe-error'
import type { Job } from 'bullmq'
import { DeliveryJobPayload, MailMergeJobData } from '../queue.types'
import { batchProgressReporter } from '../batch-progress'
import { loadBatchRecipients } from './merge-batch-recipients'
import { capitalize, DeliveryChannel } from './delivery-channel'
import { isTransientDeliveryError } from '../../adapters/delivery-errors'
import { NotificationService } from '../../api/notification/notification.service'
import { NotificationRequestDetailService } from '../../api/notification/notification-request-detail.service'
import { TemplatesRepository } from '../../api/templates/templates.repository'
import type { Template } from '../../api/templates/entities/template.entity'
import { NotificationStatus } from '../../enum/notification-status.enum'

export type MergeRecipient = NonNullable<MailMergeJobData['recipients']>[number]

/** Inline merge content, with the renderer defaulted so per-recipient variables are substituted. */
export type InlineMergeContent = NonNullable<MailMergeJobData['content']> & {
  renderer: NonNullable<NonNullable<MailMergeJobData['content']>['renderer']>
}

/** What a merge batch renders from: exactly one of a server template or inline content. */
export type MergeSource =
  | { template: Template; inline?: never }
  | { template?: never; inline: InlineMergeContent }

/** The channel-specific half of sending a merge batch. */
export interface MergeSender {
  channel: DeliveryChannel
  /** Whether the merge's content carries inline content of this channel's shape. */
  hasInlineContent(content: MailMergeJobData['content']): boolean
  /** Render for and send to one recipient; resolves the provider's id for the message. */
  send(
    recipient: MergeRecipient,
    params: Record<string, unknown>,
    source: MergeSource,
  ): Promise<string>
}

/** A job carrying one batch of a merge rather than a plain send. */
export function isMergeBatch(data: DeliveryJobPayload): boolean {
  return !!(data.mailMerge && data.mailMergeData && data.batchId)
}

export interface MergeBatchResult {
  success: boolean
  batchId: string
  sent: number
  failed: number
}

/**
 * Sends one batch of a merge and settles the parent request, for every delivery channel.
 *
 * A batch's recipients are sent one at a time. A failed recipient is recorded and skipped rather
 * than thrown, so one bad row cannot strand those already delivered; a transient provider error
 * stops the batch and leaves the rest owed; only systemic errors (a missing template) throw to
 * retry the whole batch. A retried batch starts from the top, skipping addresses an earlier
 * attempt delivered.
 */
@Injectable()
export class MergeBatchRunner {
  private readonly logger = new Logger(MergeBatchRunner.name)

  constructor(
    private readonly notificationService: NotificationService,
    private readonly requestDetailService: NotificationRequestDetailService,
    private readonly templatesRepository: TemplatesRepository,
  ) {}

  async run(job: Job<DeliveryJobPayload>, sender: MergeSender): Promise<MergeBatchResult> {
    const { notifyId, tenantId, batchId, mailMergeData } = job.data as DeliveryJobPayload & {
      batchId: string
      mailMergeData: MailMergeJobData
    }
    const { mergeLabel } = sender.channel
    const { recipients, alreadySent } = await loadBatchRecipients(
      this.requestDetailService,
      notifyId,
      batchId,
      mailMergeData.recipients,
    )
    const source = await this.resolveSource(tenantId, mailMergeData.content, sender)

    this.logger.debug(
      `[${notifyId}] Processing ${mergeLabel} batch ${batchId}: ${recipients.length} recipient(s)`,
    )
    if (alreadySent.size > 0) {
      this.logger.log(
        `[${notifyId}] Batch ${batchId}: skipping ${alreadySent.size} recipient(s) delivered on an earlier attempt`,
      )
    }
    const pending = recipients.filter((recipient) => !alreadySent.has(recipient.address))

    const reportProgress = batchProgressReporter(job)
    let sent = 0
    let failed = 0
    // Recipients delivered by an earlier attempt count as sent, so a retried batch resumes its bar.
    const progress = () => ({ sent: alreadySent.size + sent, failed, total: recipients.length })
    reportProgress(progress())

    // One at a time on purpose: progress is per recipient, and a transient error must stop the
    // batch before anyone after it is attempted.
    for (const recipient of pending) {
      const delivered = await this.sendOne(job.data, recipient, source, sender, sent)
      if (delivered) sent++
      else failed++
      reportProgress(progress())
    }

    this.logger.log(
      `[${notifyId}] ${capitalize(mergeLabel)} batch ${batchId} complete: sent=${sent}, failed=${failed}`,
    )
    await this.settle(notifyId, tenantId, sender.channel)

    return { success: failed === 0, batchId, sent, failed }
  }

  /**
   * Fail what one batch still owes - never its sent rows or another batch's - then settle the
   * parent request. For a batch that can never succeed, or whose retries are spent; the caller
   * fails the job so it is not retried.
   */
  async failUnsent(
    job: Job<DeliveryJobPayload>,
    errorMessage: string,
    channel: DeliveryChannel,
  ): Promise<void> {
    const { notifyId, tenantId, batchId } = job.data
    await this.requestDetailService.markBatchUnsentFailed(notifyId, batchId!, errorMessage)
    await this.settle(notifyId, tenantId, channel)
    this.logger.error(`[${notifyId}] Batch ${batchId} failed; its unsent recipients are FAILED`)
  }

  /**
   * Settle the parent request once no recipient is pending across all of its batches:
   * all sent → COMPLETED; some sent and some failed → PARTIALLY_COMPLETED; all failed → FAILED.
   */
  async settle(notifyId: string, tenantId: string, channel: DeliveryChannel): Promise<void> {
    const counts = await this.requestDetailService.countByStatuses(notifyId)
    const status = settledMergeStatus(counts)
    if (!status) return

    await this.notificationService.update(notifyId, tenantId, {
      status,
      updatedBy: channel.updatedBy,
    })
    this.logger.log(
      `[${notifyId}] All ${channel.mergeLabel} batches complete; parent marked ${status.toUpperCase()}`,
    )
  }

  private async resolveSource(
    tenantId: string,
    content: MailMergeJobData['content'],
    sender: MergeSender,
  ): Promise<MergeSource> {
    const label = capitalize(sender.channel.mergeLabel)
    const templateId = content?.templateId
    const hasInlineContent = sender.hasInlineContent(content)

    if (templateId && hasInlineContent) {
      throw new Error(`${label} requires either a templateId or inline content, not both`)
    }
    if (!templateId) {
      if (!hasInlineContent) {
        throw new Error(`${label} requires either a templateId or inline content`)
      }
      return { inline: { ...content!, renderer: content!.renderer ?? 'handlebars' } }
    }

    const template = await this.templatesRepository.findById(tenantId, templateId)
    if (!template) {
      throw new NotFoundException(`Template '${templateId}' not found for tenant '${tenantId}'`)
    }
    const { templateCode } = sender.channel
    if (template.channelCode !== templateCode) {
      throw new Error(`Template '${templateId}' is not an ${templateCode} template`)
    }
    return { template }
  }

  /** Send to one recipient and record the outcome; false when that recipient failed. */
  private async sendOne(
    { notifyId, batchId, mailMergeData }: DeliveryJobPayload,
    recipient: MergeRecipient,
    source: MergeSource,
    sender: MergeSender,
    sentSoFar: number,
  ): Promise<boolean> {
    // Per-recipient params take precedence over the global ones.
    const params = { ...mailMergeData?.params, ...recipient.params }
    try {
      const externalId = await sender.send(recipient, params, source)
      await this.requestDetailService.markRecipientSent(
        notifyId,
        batchId!,
        recipient.address,
        externalId,
      )
      return true
    } catch (error) {
      // The provider, not this recipient: stop the batch and leave the rest owed. The job is
      // retried, skipping whoever was sent, and the circuit breaker holds it until it is back.
      if (isTransientDeliveryError(error)) {
        this.logger.warn(
          `[${notifyId}] Batch ${batchId} paused after ${sentSoFar} sent: ${error.message}`,
        )
        throw error
      }
      const errorMessage = describeError(error)
      this.logger.error(
        `[${notifyId}] ${capitalize(sender.channel.mergeLabel)} recipient send failed (batch=${batchId}): ${errorMessage}`,
      )
      await this.requestDetailService.markRecipientFailed(
        notifyId,
        batchId!,
        recipient.address,
        errorMessage,
      )
      return false
    }
  }
}

/** The parent status a merge settles at, or null while any recipient is still pending. */
export function settledMergeStatus(counts: Record<string, number>): NotificationStatus | null {
  if (counts.pending) return null
  if (!counts.failed) return NotificationStatus.COMPLETED
  return counts.sent ? NotificationStatus.PARTIALLY_COMPLETED : NotificationStatus.FAILED
}
