import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import type { Job } from 'bullmq'
import { DeliveryJobPayload } from '../queue.types'
import { SMS_CHANNEL } from './delivery-channel'
import { DeliveryFailureHandler } from './delivery-failure-handler'
import { MergeBatchRunner, MergeSender } from './merge-batch-runner'
import { DeliveryWorker } from './delivery-worker'
import { TransientDeliveryError } from '../../adapters/delivery-errors'
import { QueueName } from '../../enum/queue-name.enum'
import { NotificationService } from '../../api/notification/notification.service'
import { NotificationRequestDetailService } from '../../api/notification/notification-request-detail.service'
import { TemplatesRepository } from '../../api/templates/templates.repository'
import { TemplatesService } from '../../api/templates/templates.service'
import { InlineRenderingService } from '../../services/rendering/inline-rendering.service'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { ISmsTransport, SMS_ADAPTER, SmsRecipientResult } from '../../adapters'
import { StructuredLoggerService } from '../../common/logger'
import { PhoneNumberService } from '../../api/notify/services/phone-number.service'

type SmsPayload = DeliveryJobPayload['payload']

interface SmsSendResult {
  externalId: string
  provider: string
  providerResponse?: string
  /** Per-recipient outcomes, from a transport that reports them. */
  results?: SmsRecipientResult[]
}

function hasBody(payload: SmsPayload): boolean {
  return !!payload.content?.body && typeof payload.content.body === 'string'
}

/**
 * SMS Delivery Worker
 *
 * A plain send renders its body (a server template or inline content) and sends it to every
 * recipient through the SMS adapter; a transport that reports per recipient has each outcome
 * recorded on its own row. A merge batch sends each recipient their own rendering
 * (MergeBatchRunner). A failure is settled by DeliveryFailureHandler and retried.
 *
 * Idempotency: the job key is notifyId_sms, or the batchId for a merge batch.
 */
@Injectable()
export class SmsDeliveryWorker extends DeliveryWorker {
  readonly queueName = QueueName.SMS_DELIVERY
  readonly concurrency = { configKey: 'smsDeliveryWorkerConcurrency', default: 2 }
  protected readonly channel = SMS_CHANNEL
  protected readonly logger = new Logger(SmsDeliveryWorker.name)

  constructor(
    private readonly notificationService: NotificationService,
    private readonly requestDetailService: NotificationRequestDetailService,
    private readonly templatesRepository: TemplatesRepository,
    private readonly templatesService: TemplatesService,
    private readonly inlineRenderingService: InlineRenderingService,
    @Inject(SMS_ADAPTER) private readonly smsAdapter: ISmsTransport,
    private readonly phoneNumberService: PhoneNumberService,
    mergeBatches: MergeBatchRunner,
    failures: DeliveryFailureHandler,
    @Optional() structuredLogger?: StructuredLoggerService,
  ) {
    super(mergeBatches, failures, structuredLogger)
  }

  /** Render each merge recipient's body from their own params and send it. */
  protected mergeSender(job: Job<DeliveryJobPayload>): MergeSender {
    const { notifyId } = job.data
    return {
      channel: SMS_CHANNEL,
      hasInlineContent: (content) => !!content?.body,
      send: async (recipient, params, { template, inline }) => {
        const { body } = template
          ? await this.templatesService.renderTemplateContent(template, params)
          : await this.inlineRenderingService.renderSms(inline, params)
        const result = await this.sendSms(
          { recipients: { to: [recipient.address] }, content: { body } },
          notifyId,
        )
        return result.externalId
      },
    }
  }

  /** A plain send: one body to every recipient on the job. */
  protected async deliver(job: Job<DeliveryJobPayload>, startedAt: number): Promise<unknown> {
    const { notifyId, tenantId } = job.data
    const payload = this.validatedPayload(job.data.payload)

    // A redelivered job (a stalled worker, a rolling deploy) must not send again to anyone a
    // previous attempt already reached. resetForRetry keeps their rows; the send list, which comes
    // from the payload rather than those rows, is filtered against them below. The lookup runs on
    // every attempt because a stalled job is re-run without incrementing attemptsMade.
    if ((job.attemptsMade ?? 0) > 0) {
      await this.requestDetailService.resetForRetry(notifyId)
    }
    const alreadySent = await this.requestDetailService.findSentAddresses(notifyId)

    let resolved = await this.render(job.data, payload)

    await this.notificationService.update(notifyId, tenantId, {
      status: NotificationStatus.SENDING,
      updatedBy: 'system',
    })
    await this.requestDetailService.updateStatus(notifyId, NotificationStatus.SENDING, {
      preserveCompleted: true,
    })
    this.logger.debug(`[${notifyId}] Updated notification status to SENDING`)

    if (alreadySent.size > 0) {
      const remaining = resolved.recipients.to.filter((recipient) => !alreadySent.has(recipient))
      if (remaining.length === 0) {
        this.logger.log(
          `[${notifyId}] Every recipient was delivered on an earlier attempt; nothing to re-send`,
        )
        await this.notificationService.update(notifyId, tenantId, {
          status: NotificationStatus.COMPLETED,
          updatedBy: 'system',
        })
        return { success: true, notifyId }
      }

      this.logger.log(
        `[${notifyId}] Skipping ${alreadySent.size} recipient(s) delivered on an earlier attempt`,
      )
      resolved = { ...resolved, recipients: { ...resolved.recipients, to: remaining } }
    }

    const result = await this.sendSms(resolved, notifyId)
    this.logger.debug(`[${notifyId}] SMS sent: ${result.providerResponse ?? ''}`)

    const finalStatus = await this.recordOutcome(notifyId, result)
    await this.notificationService.update(notifyId, tenantId, {
      status: finalStatus,
      updatedBy: 'system',
    })
    this.logger.log(`[${notifyId}] Notification marked as ${finalStatus.toUpperCase()}`)
    this.structuredLogger?.logNotificationSuccess(
      notifyId,
      tenantId,
      'sms',
      result.externalId,
      Date.now() - startedAt,
      SMS_CHANNEL.context,
    )

    return { success: true, externalId: result.externalId, provider: result.provider }
  }

  private validatedPayload(payload: SmsPayload): SmsPayload {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid delivery job: SMS payload is missing or invalid')
    }
    const to = payload.recipients?.to
    if (!Array.isArray(to) || to.length === 0) {
      throw new Error('Invalid SMS payload: recipient phone number is missing or invalid')
    }
    const invalidIndex = to.findIndex((recipient) => !this.phoneNumberService.isValid(recipient))
    if (invalidIndex !== -1) {
      throw new BadRequestException(
        `Invalid SMS payload: recipient phone number at index ${invalidIndex} is not valid E.164`,
      )
    }
    // A template supplies the body when rendered, so only inline content needs one now.
    if (!payload.content?.templateId && !hasBody(payload)) {
      throw new Error('Invalid SMS payload: body is missing or invalid')
    }
    return payload
  }

  /** Render the body from a server template or inline content. SMS is always plain text. */
  private async render(
    { notifyId, tenantId, request }: DeliveryJobPayload,
    payload: SmsPayload,
  ): Promise<SmsPayload> {
    const templateId = payload.content?.templateId
    const params = { ...request?.params, ...payload.params }
    let rendered = payload

    if (templateId) {
      rendered = await this.renderTemplate(notifyId, tenantId, templateId, payload, params)
    } else if (payload.content?.renderer) {
      this.logger.debug(
        `[${notifyId}] Rendering inline content with renderer: ${payload.content.renderer}`,
      )
      try {
        const { body } = await this.inlineRenderingService.renderSms(payload.content, params)
        rendered = { ...payload, content: { ...payload.content, body } }
        this.logger.debug(`[${notifyId}] Inline content rendered successfully`)
      } catch (error) {
        this.logger.error(
          `[${notifyId}] Failed to render inline content: ${(error as Error).message}`,
        )
        throw error
      }
    }

    if (!hasBody(rendered)) {
      throw new Error('Invalid SMS payload: body is missing or invalid')
    }
    return rendered
  }

  private async renderTemplate(
    notifyId: string,
    tenantId: string,
    templateId: string,
    payload: SmsPayload,
    params: Record<string, unknown>,
  ): Promise<SmsPayload> {
    this.logger.debug(`[${notifyId}] Resolving template: ${templateId}`)
    try {
      const template = await this.templatesRepository.findById(tenantId, templateId)
      if (!template) {
        throw new NotFoundException(`Template '${templateId}' not found for tenant '${tenantId}'`)
      }
      // A template of another channel leaves the payload's own content to be validated.
      if (template.channelCode !== 'SMS') return payload

      const { body, bodyType } = await this.templatesService.renderTemplateContent(template, params)
      this.logger.debug(`[${notifyId}] Template resolved and rendered into SMS payload`)
      return { ...payload, content: { ...payload.content, body, bodyType } }
    } catch (error) {
      this.logger.error(`[${notifyId}] Failed to resolve template: ${(error as Error).message}`)
      throw error
    }
  }

  /**
   * Record who the send reached, and return the request's status. A transport that reports per
   * recipient has each outcome written to its own row, so a partial failure is visible and the
   * successes are not repeated by a retry; one that cannot is all-or-nothing.
   */
  private async recordOutcome(
    notifyId: string,
    result: SmsSendResult,
  ): Promise<NotificationStatus> {
    if (!result.results?.length) {
      await this.requestDetailService.markSent(notifyId, result.externalId)
      return NotificationStatus.COMPLETED
    }

    // One row at a time: a plain send's recipient list is unbounded, and this keeps it to one
    // pooled connection rather than one per recipient.
    for (const recipient of result.results) {
      // The provider could not take it: still owed, not failed. Sent again below.
      if (recipient.transient) continue
      await (recipient.success
        ? this.requestDetailService.markRecipientSent(
            notifyId,
            null,
            recipient.to,
            recipient.messageId,
          )
        : this.requestDetailService.markRecipientFailed(
            notifyId,
            null,
            recipient.to,
            recipient.error ?? 'Send failed',
          ))
    }

    // Who was sent is recorded above, so the retry skips them; the rest are sent again once the
    // provider is back.
    const owed = result.results.filter((recipient) => recipient.transient)
    if (owed.length > 0) {
      throw new TransientDeliveryError(
        `${owed.length} recipient(s) not sent, provider unavailable: ${owed[0].error ?? ''}`,
        502,
      )
    }

    const failedCount = result.results.filter((recipient) => !recipient.success).length
    if (failedCount === 0) return NotificationStatus.COMPLETED
    this.logger.warn(
      `[${notifyId}] SMS partially delivered: ${failedCount} of ${result.results.length} recipient(s) failed`,
    )
    return NotificationStatus.PARTIALLY_COMPLETED
  }

  private async sendSms(payload: any, notifyId: string): Promise<SmsSendResult> {
    this.logger.debug(`[${notifyId}] Sending SMS via ${this.smsAdapter.name} adapter`)

    // Tagged with our id so a provider delivery report can be matched back to this notification.
    const result = await this.smsAdapter.send({ ...(payload as object), tag: notifyId } as any)

    return {
      externalId:
        result.messageId || result.providerResponse || `${this.smsAdapter.name}-${Date.now()}`,
      provider: this.smsAdapter.name,
      providerResponse: result.providerResponse,
      results: result.results,
    }
  }
}
