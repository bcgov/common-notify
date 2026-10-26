import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import type { Job } from 'bullmq'
import { DeliveryJobPayload } from '../queue.types'
import { EMAIL_CHANNEL } from './delivery-channel'
import { DeliveryFailureHandler } from './delivery-failure-handler'
import { MergeBatchRunner, MergeSender } from './merge-batch-runner'
import { DeliveryWorker } from './delivery-worker'
import { QueueName } from '../../enum/queue-name.enum'
import { NotificationService } from '../../api/notification/notification.service'
import { NotificationRequestDetailService } from '../../api/notification/notification-request-detail.service'
import { TemplatesRepository } from '../../api/templates/templates.repository'
import { TemplatesService } from '../../api/templates/templates.service'
import { TenantSettingsService } from '../../api/tenant-settings/tenant-settings.service'
import { InlineRenderingService } from '../../services/rendering/inline-rendering.service'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { NotifyEmailChannel } from '../../api/notify/schemas/notify-email-channel'
import { ProcessedNotifyEmailChannel } from '../../api/notify/schemas/stored-notify-attachment'
import { AttachmentResolverService } from '../../api/notify/services/attachment-resolver.service'
import {
  EventEmailSendSettings,
  EventNotificationResolver,
} from '../../api/events/event-notification.resolver'
import type { EmailHeaderOverride } from '../../api/templates/email-template-layout.service'
import { EMAIL_ADAPTER, IEmailTransport } from '../../adapters'
import { SendEmailOptions } from '../../adapters/interfaces/delivery/email.interface'
import { StructuredLoggerService } from '../../common/logger'

type ResolvedEmailDeliveryPayload = Omit<NotifyEmailChannel, 'attachments'> & {
  attachments?: SendEmailOptions['attachments']
}

type EmailPayload = NotifyEmailChannel | ProcessedNotifyEmailChannel | ResolvedEmailDeliveryPayload

/** Sender and header for every recipient of one job. */
interface SendSettings {
  /** Null leaves the adapter on its own default sender. */
  fromAddress: string | null
  headerOverride?: EmailHeaderOverride
}

function normalizeTemplateBodyType(
  bodyType: 'text' | 'markdown' | 'html' | undefined,
): 'markdown' | undefined {
  return bodyType === 'markdown' || bodyType === 'text' ? 'markdown' : undefined
}

function hasAttachmentReferences(
  attachments: unknown,
): attachments is NonNullable<ProcessedNotifyEmailChannel['attachments']> {
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

function hasRecipients(payload: EmailPayload): boolean {
  const to = payload.recipients?.to
  return Array.isArray(to) && to.length > 0
}

function assertContent(payload: EmailPayload): void {
  if (!payload.content?.subject || typeof payload.content.subject !== 'string') {
    throw new Error('Invalid email payload: subject is missing or invalid')
  }
  if (!payload.content?.body || typeof payload.content.body !== 'string') {
    throw new Error('Invalid email payload: body is missing or invalid')
  }
}

/**
 * Email Delivery Worker
 *
 * A plain send is one email to all of its recipients: render (a server template or inline
 * content), brand it with the tenant's layout, resolve stored attachments, send it through the
 * email adapter, and mark the request COMPLETED. A merge batch sends each recipient their own
 * rendering (MergeBatchRunner). A failure is settled by DeliveryFailureHandler and retried.
 *
 * Idempotency: the job key is notifyId_email, or the batchId for a merge batch.
 */
@Injectable()
export class EmailDeliveryWorker extends DeliveryWorker {
  readonly queueName = QueueName.EMAIL_DELIVERY
  readonly concurrency = { configKey: 'emailDeliveryWorkerConcurrency', default: 2 }
  protected readonly channel = EMAIL_CHANNEL
  protected readonly logger = new Logger(EmailDeliveryWorker.name)

  constructor(
    private readonly notificationService: NotificationService,
    private readonly requestDetailService: NotificationRequestDetailService,
    private readonly templatesRepository: TemplatesRepository,
    private readonly templatesService: TemplatesService,
    private readonly inlineRenderingService: InlineRenderingService,
    private readonly attachmentResolverService: AttachmentResolverService,
    @Inject(EMAIL_ADAPTER) private readonly emailAdapter: IEmailTransport,
    mergeBatches: MergeBatchRunner,
    failures: DeliveryFailureHandler,
    @Optional() structuredLogger?: StructuredLoggerService,
    @Optional() private readonly tenantSettingsService?: TenantSettingsService,
    @Optional() private readonly eventNotificationResolver?: EventNotificationResolver,
  ) {
    super(mergeBatches, failures, structuredLogger)
  }

  /**
   * The sender and header for this job. An event-sourced send carries its own, which have no home
   * on the request payload - the request records which event it came from and they are read back
   * here. Every other send uses the tenant's configured sender, or none (the adapter's default).
   */
  private async resolveSendSettings(notifyId: string, tenantId: string): Promise<SendSettings> {
    const eventSettings = await this.resolveEventSettings(notifyId, tenantId)
    const fromAddress =
      eventSettings?.senderEmail ??
      (await this.tenantSettingsService?.getSenderAddress(tenantId)) ??
      null
    const headerOverride = eventSettings?.useCustomHeader
      ? { logoId: eventSettings.headerLogoId, title: eventSettings.headerTitle }
      : undefined
    return { fromAddress, headerOverride }
  }

  private async resolveEventSettings(
    notifyId: string,
    tenantId: string,
  ): Promise<EventEmailSendSettings | null> {
    if (!this.eventNotificationResolver) return null

    try {
      const notification = await this.notificationService.findOne(notifyId, tenantId)
      if (!notification?.eventId) return null

      return await this.eventNotificationResolver.findEmailSendSettings(notification.eventId)
    } catch (error) {
      this.logger.warn(
        `[${notifyId}] Could not read event send settings, falling back to the tenant's: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return null
    }
  }

  /**
   * Render, brand and send each merge recipient their own email. An event test send can be a
   * merge, and needs the event's sender and header as much as a single send does - one read per
   * batch, not per recipient.
   */
  protected async mergeSender(job: Job<DeliveryJobPayload>): Promise<MergeSender> {
    const { notifyId, tenantId } = job.data
    const settings = await this.resolveSendSettings(notifyId, tenantId)
    return {
      channel: EMAIL_CHANNEL,
      hasInlineContent: (content) => !!(content && (content.subject || content.body)),
      send: async (recipient, params, { template, inline }) => {
        const content = template
          ? await this.templatesService.applyEmailLayout(
              template,
              await this.templatesService.renderTemplateContent(template, params),
              settings.headerOverride,
            )
          : await this.templatesService.applyEmailLayout(
              { tenantId, channelCode: 'EMAIL' },
              {
                ...(await this.inlineRenderingService.renderEmail(inline, params)),
                bodyType: inline.bodyType ?? 'text',
              },
              settings.headerOverride,
            )

        const { subject, body, bodyType } = content
        const result = await this.sendEmail(
          { recipients: { to: [recipient.address] }, content: { subject, body, bodyType } } as any,
          notifyId,
          settings.fromAddress,
        )
        return result.externalId
      },
    }
  }

  /** A plain send: one email to every recipient on the job. */
  protected async deliver(job: Job<DeliveryJobPayload>, startedAt: number): Promise<unknown> {
    const { notifyId, tenantId } = job.data
    const settings = await this.resolveSendSettings(notifyId, tenantId)
    const payload = this.validatedPayload(job.data.payload)

    if ((job.attemptsMade ?? 0) > 0) {
      await this.requestDetailService.resetForRetry(notifyId)
    }

    // Checked on every run, not only on a counted retry: a job whose pod stopped mid-send (a
    // rolling deploy, an HPA scale-down) is re-run without incrementing attemptsMade. A single
    // email is one message to all of its recipients, so it was delivered in full or not at all.
    const alreadySent = await this.requestDetailService.findSentAddresses(notifyId)
    if (
      alreadySent.size > 0 &&
      payload.recipients.to.every((address) => alreadySent.has(address))
    ) {
      this.logger.log(`[${notifyId}] Delivered on an earlier attempt; nothing to re-send`)
      await this.notificationService.update(notifyId, tenantId, {
        status: NotificationStatus.COMPLETED,
        updatedBy: 'system',
      })
      return { success: true, notifyId }
    }

    // Rendered before SENDING, so a render error does not leave the notification stuck there.
    const rendered = await this.render(job.data, payload, settings.headerOverride)
    const resolved = await this.resolveAttachments(notifyId, tenantId, rendered)

    await this.notificationService.update(notifyId, tenantId, {
      status: NotificationStatus.SENDING,
      updatedBy: 'system',
    })
    await this.requestDetailService.updateStatus(notifyId, NotificationStatus.SENDING, {
      preserveCompleted: true,
    })
    this.logger.debug(`[${notifyId}] Updated notification status to SENDING`)

    const result = await this.sendEmail(resolved, notifyId, settings.fromAddress)
    this.logger.debug(`[${notifyId}] Email sent successfully: ${JSON.stringify(result)}`)

    // It has reached the SMTP gateway: the recipients are sent.
    await this.requestDetailService.markSent(notifyId, result.externalId)
    await this.notificationService.update(notifyId, tenantId, {
      status: NotificationStatus.COMPLETED,
      updatedBy: 'system',
    })
    this.logger.log(`[${notifyId}] Notification marked as COMPLETED`)
    this.structuredLogger?.logNotificationSuccess(
      notifyId,
      tenantId,
      'email',
      result.externalId,
      Date.now() - startedAt,
      EMAIL_CHANNEL.context,
    )

    return { success: true, externalId: result.externalId, provider: result.provider }
  }

  private validatedPayload(payload: DeliveryJobPayload['payload']): EmailPayload {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid delivery job: email payload is missing or invalid')
    }
    const emailPayload = payload as EmailPayload
    if (!hasRecipients(emailPayload)) {
      throw new Error('Invalid email payload: recipient email address is missing or invalid')
    }
    // A template supplies subject and body when rendered, so only inline content needs them now.
    if (!emailPayload.content?.templateId) assertContent(emailPayload)
    return emailPayload
  }

  /** Render the payload's content - a server template or inline content - and brand it. */
  private async render(
    { notifyId, tenantId, request }: DeliveryJobPayload,
    payload: EmailPayload,
    headerOverride: EmailHeaderOverride | undefined,
  ): Promise<EmailPayload> {
    const templateId = payload.content?.templateId
    const params = { ...request?.params, ...payload.params }
    let rendered = payload

    if (templateId) {
      rendered = await this.renderTemplate(
        notifyId,
        tenantId,
        templateId,
        payload,
        params,
        headerOverride,
      )
    } else {
      if (payload.content?.renderer) {
        rendered = await this.renderInline(notifyId, payload, params)
      }
      // Template sends are branded as they render; inline and pre-rendered sends are branded here.
      const branded = await this.templatesService.applyEmailLayout(
        { tenantId, channelCode: 'EMAIL' },
        {
          subject: rendered.content?.subject,
          body: rendered.content?.body,
          bodyType: rendered.content?.bodyType ?? 'text',
        },
        headerOverride,
      )
      rendered = { ...rendered, content: { ...rendered.content, ...branded } }
    }

    assertContent(rendered)
    return rendered
  }

  private async renderTemplate(
    notifyId: string,
    tenantId: string,
    templateId: string,
    payload: EmailPayload,
    params: Record<string, unknown>,
    headerOverride: EmailHeaderOverride | undefined,
  ): Promise<EmailPayload> {
    this.logger.debug(`[${notifyId}] Resolving template: ${templateId}`)
    try {
      const template = await this.templatesRepository.findById(tenantId, templateId)
      if (!template) {
        throw new NotFoundException(`Template '${templateId}' not found for tenant '${tenantId}'`)
      }
      // A template of another channel leaves the payload's own content to be validated.
      if (template.channelCode !== 'EMAIL') return payload

      // Legacy body types are normalized before the markdown-only render path.
      const content = await this.templatesService.renderTemplateContent(
        template,
        params,
        normalizeTemplateBodyType(payload.content?.bodyType),
      )
      const rendered = await this.templatesService.applyEmailLayout(
        template,
        content,
        headerOverride,
      )
      this.logger.debug(`[${notifyId}] Template resolved and rendered into email payload`)
      return {
        ...payload,
        content: {
          ...payload.content,
          subject: rendered.subject || payload.content?.subject,
          body: rendered.body,
          bodyType: rendered.bodyType,
        },
      }
    } catch (error) {
      this.logger.error(`[${notifyId}] Failed to resolve template: ${(error as Error).message}`)
      throw error
    }
  }

  private async renderInline(
    notifyId: string,
    payload: EmailPayload,
    params: Record<string, unknown>,
  ): Promise<EmailPayload> {
    this.logger.debug(
      `[${notifyId}] Rendering inline content with renderer: ${payload.content.renderer}`,
    )
    try {
      const rendered = await this.inlineRenderingService.renderEmail(payload.content, params)
      this.logger.debug(`[${notifyId}] Inline content rendered successfully`)
      return {
        ...payload,
        content: { ...payload.content, subject: rendered.subject, body: rendered.body },
      }
    } catch (error) {
      this.logger.error(
        `[${notifyId}] Failed to render inline content: ${(error as Error).message}`,
      )
      throw error
    }
  }

  /** Swap stored attachment references for their content. */
  private async resolveAttachments(
    notifyId: string,
    tenantId: string,
    payload: EmailPayload,
  ): Promise<EmailPayload> {
    if (!payload.attachments) return payload
    if (!hasAttachmentReferences(payload.attachments)) {
      throw new Error('Invalid processed email attachment reference payload')
    }
    if (!this.attachmentResolverService) {
      throw new Error(
        'AttachmentResolverService is not available to resolve stored email attachments',
      )
    }

    this.logger.debug(
      `[${notifyId}] Resolving stored email attachments: ${JSON.stringify({
        tenantId,
        storedAttachmentCount: payload.attachments.length,
      })}`,
    )
    const attachments = await this.attachmentResolverService.resolveEmailAttachments(
      tenantId,
      payload.attachments,
    )
    return {
      ...payload,
      attachments: attachments as SendEmailOptions['attachments'],
    } as ResolvedEmailDeliveryPayload
  }

  private async sendEmail(
    payload: EmailPayload,
    notifyId: string,
    fromAddress: string | null,
  ): Promise<{ externalId: string; provider: string }> {
    const attachmentCount = Array.isArray(payload.attachments) ? payload.attachments.length : 0
    this.logger.debug(
      `[${notifyId}] Sending email via ${this.emailAdapter.name} adapter: ${JSON.stringify({
        attachmentCount,
      })}`,
    )

    // Only set `from` when one is configured: the adapters read their own default when the field
    // is absent, and an explicit undefined would not be the same thing.
    const result = await this.emailAdapter.send(
      (fromAddress ? { ...payload, from: fromAddress } : payload) as any,
    )

    return {
      externalId:
        result.messageId || result.providerResponse || `${this.emailAdapter.name}-${Date.now()}`,
      provider: this.emailAdapter.name,
    }
  }
}
