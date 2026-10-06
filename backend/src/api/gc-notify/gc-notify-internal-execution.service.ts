import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import Bull from 'bull'
import { TemplatesRepository } from '../templates/templates.repository'
import { TemplatesService } from '../templates/templates.service'
import { Template } from '../templates/entities/template.entity'
import type { TemplateResponseDto } from '../templates/schemas/template-response.dto'
import { NotificationService } from '../notification/notification.service'
import { NotificationRequestDetailService } from '../notification/notification-request-detail.service'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { SafelistService } from '../safelist/safelist.service'
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service'
import { ListQueryDto } from '../../common/query/list-query.dto'
import { parseListQuery } from '../../common/query/list-query.parser'
import type { QueryableFieldsConfig } from '../../common/query/list-query.types'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplateEngine } from '../../enum/template-engine.enum'
import { toGcNotifyEmailHtml, toGcNotifySubject } from '../../services/rendering/gc-notify-markdown'
import { QueueName } from '../../enum/queue-name.enum'
import { IngestionJobPayload } from '../../queue/queue.types'
import { CreateEmailNotificationRequest } from './schemas/create-email-notification-request'
import { CreateSmsNotificationRequest } from './schemas/create-sms-notification-request'
import { NotificationResponse } from './schemas/notification-response'
import { Notification as GcNotification } from './schemas/notification'
import { Template as GcTemplate } from './schemas/template'
import { Links } from './schemas/links'
import type { FileAttachment } from './schemas/file-attachment'
import Papa from 'papaparse'
import { UnprocessableEntityException } from '@nestjs/common'
import {
  claimSend,
  enforceLimits,
  findDuplicateSend,
  handleMerge,
  recordAcceptedUsage,
  resolveSmsSegments,
} from '../../common/decorators/queueable.decorator'
import type { QueueableContext } from '../../common/decorators/queueable.decorator'
import { PostBulkRequest } from './schemas/post-bulk-request'
import { PostBulkResponse } from './schemas/post-bulk-response'
import { GcNotifyBulkValidationService } from './gc-notify-bulk-validation.service'
import { ApiKeyUsageService } from '../api-keys/api-key-usage.service'
import { SmsSegmentService } from '../notify/services/sms-segment.service'
import { AttachmentValidationService } from '../notify/services/attachment-validation.service'
import { AttachmentProcessingService } from '../notify/services/attachment-processing.service'
import { NotificationDedupService } from '../notify/services/notification-dedup.service'
import type { NotifySimpleRequest } from '../notify/schemas/notify-simple-request'
import type { NotifyEmailChannel } from '../notify/schemas/notify-email-channel'
import type { NotifyAttachment } from '../notify/schemas/notify-attachment'
import type { StoredNotifyAttachment } from '../notify/schemas/stored-notify-attachment'
import { COMPLETED_JOB_RETENTION, FAILED_JOB_RETENTION } from '../../queue/job-retention'

const TEMPLATE_LIST_QUERY_CONFIG: QueryableFieldsConfig = {
  sortableFields: { name: 'template.name', updatedAt: 'template.updatedAt' },
  filterableFields: {
    channelCode: { column: 'template.channelCode', valueType: 'string', operators: ['eq'] },
  },
  defaultSort: [{ field: 'updatedAt', direction: 'DESC' }],
}

// Best-effort mapping from GC Notify's list-query status values (which use a
// different, smaller vocabulary than the Notification.status response enum -
// this mismatch exists in the real GC Notify spec itself) to our internal
// NotificationStatus values.
const GC_NOTIFY_QUERY_STATUS_TO_INTERNAL: Record<string, NotificationStatus[]> = {
  created: [NotificationStatus.PENDING, NotificationStatus.ACCEPTED, NotificationStatus.QUEUED],
  pending: [NotificationStatus.PENDING],
  'in-transit': [NotificationStatus.PROCESSING, NotificationStatus.SENDING],
  sent: [NotificationStatus.COMPLETED],
  delivered: [NotificationStatus.COMPLETED],
  failed: [NotificationStatus.FAILED, NotificationStatus.QUARANTINED],
}

// Maps our internal NotificationStatus to GC Notify's Notification.status response enum.
function toGcNotifyResponseStatus(status: string): string {
  switch (status) {
    case NotificationStatus.PENDING:
    case NotificationStatus.ACCEPTED:
    case NotificationStatus.QUEUED:
    case NotificationStatus.SCHEDULED:
      return 'created'
    case NotificationStatus.PROCESSING:
    case NotificationStatus.SENDING:
      return 'sending'
    case NotificationStatus.COMPLETED:
      return 'delivered'
    case NotificationStatus.FAILED:
      return 'permanent-failure'
    case NotificationStatus.QUARANTINED:
      return 'virus-scan-failed'
    default:
      return 'created'
  }
}

// GC Notify's FileAttachment carries only file/filename/sending_method - no MIME
// type - but the native attachment pipeline (validation, storage) requires one and
// checks it against the mime_type_code allow-list. We derive it from the filename
// extension. Kept in lockstep with the mime_type_code seed (migrations V33) and the
// MIME_TYPE_EXTENSION_MAP in attachment.service.ts; an extension not listed here is
// rejected rather than guessed.
const GC_NOTIFY_EXTENSION_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
}

interface MappableNotification {
  id: string
  tenantId: string
  status: string
  channelCode?: string
  recipients?: { email?: string[]; sms?: string[] }
  payload?: { templateId?: string; params?: Record<string, unknown>; reference?: string }
  createdAt: Date
  delayedSendTime?: Date
}

/**
 * A personalisation entry that feeds template rendering. An array is a list value: the legacy
 * renderer turns it into bullets in an email body and into "a, b and c" in a subject or SMS.
 * Items are not deeply validated, so the element type stays `unknown`.
 */
type TemplateParamValue = string | unknown[]

/**
 * Executes GC Notify-compatible send requests against our own Notify pipeline
 * instead of passing them through to the real GC Notify API. Templates are
 * assumed to be pre-provisioned locally with the same id the GC Notify client
 * sends as template_id - there is no GC Notify template sync/import in this
 * service, so a missing template is a hard error, not a passthrough fallback.
 *
 * Mirrors the real GC Notify API's own behavior: the response (201, rendered
 * content) is returned synchronously, while actual delivery happens
 * asynchronously - reusing the same durable create-then-enqueue pattern the
 * native /notifysimple flow uses (see common/decorators/queueable.decorator.ts),
 * translated into the ingestion queue's job shape so the existing email/sms
 * delivery workers can be reused unmodified.
 *
 * Known gap: there is no tenant-level default sender identity resolution yet
 * (see NotifyEmailChannel.identityId, which nothing currently consumes), so
 * from_email/from_number fall back to an optionally-configured NotifyConfiguration
 * value or an explicit placeholder.
 *
 * Email file-attachment personalisation IS forwarded: file-valued personalisation
 * entries are lifted out, validated + stored via the shared attachment pipeline
 * (AttachmentValidationService / AttachmentProcessingService), and enqueued as
 * stored-attachment references on the ingestion payload, so the existing ClamAV
 * scan (ingestion worker) and attachment resolution (email delivery worker) apply
 * unchanged. Two GC Notify features are intentionally not supported here and are
 * rejected with a 400: sending_method 'link' (needs GC Notify-style file hosting,
 * which we don't do) and file types whose extension isn't in the mime_type_code
 * allow-list. SMS attachments aren't a GC Notify feature and aren't handled.
 */
@Injectable()
export class GcNotifyInternalExecutionService {
  private readonly logger = new Logger(GcNotifyInternalExecutionService.name)

  constructor(
    private readonly templatesRepository: TemplatesRepository,
    private readonly templatesService: TemplatesService,
    private readonly notificationService: NotificationService,
    private readonly notificationRequestDetailService: NotificationRequestDetailService,
    private readonly safelistService: SafelistService,
    private readonly tenantSettingsService: TenantSettingsService,
    @InjectRepository(NotifyConfiguration)
    private readonly configurationRepository: Repository<NotifyConfiguration>,
    @Inject(QueueName.INGESTION) private readonly ingestionQueue: Bull.Queue<IngestionJobPayload>,
    private readonly attachmentValidationService: AttachmentValidationService,
    private readonly attachmentProcessingService: AttachmentProcessingService,
    private readonly bulkValidationService: GcNotifyBulkValidationService,
    private readonly apiKeyUsageService: ApiKeyUsageService,
    private readonly smsSegmentService: SmsSegmentService,
    private readonly notificationDedupService: NotificationDedupService,
  ) {}

  async sendEmail(
    body: CreateEmailNotificationRequest,
    tenantId: string,
    apiKeyConsumerId?: string,
    requestRoute?: string,
  ): Promise<NotificationResponse> {
    const template = await this.requireTemplate(
      tenantId,
      body.template_id,
      NotificationChannel.EMAIL,
    )
    const { params: personalisation, files } = this.splitPersonalisation(body.personalisation)
    const rendered = await this.renderWithLegacyGcNotifyEngine(template, personalisation)
    const content = this.renderGcNotifyEmailContent(rendered)
    // The same address delivery will send from, so the 201 cannot report a sender the recipient
    // never sees. gc_notify_default_from_email is not consulted: nothing in the delivery path
    // reads it.
    const fromEmail = await this.tenantSettingsService.resolveSenderAddress(tenantId)

    // Fingerprinted from the GC Notify body, not the notifyRequest built below: storing the
    // attachments gives each file a new id, so that would never match. Checked before storing
    // them so a duplicate uploads nothing.
    const { fingerprint, duplicate } = await findDuplicateSend(this.queueableContext(), tenantId, {
      email: { recipients: { to: [body.email_address] } },
      gcNotify: { ...body, email_address: undefined, templateVersion: template.version },
    })
    const attachments = duplicate ? [] : await this.storeAttachments(files, tenantId)
    // No top-level templateId: the delivery worker has two modes — template mode
    // (re-renders at delivery time when request.templateId is set) and pre-rendered
    // mode (uses request.email.content directly). GC Notify's 201 response already
    // contains the rendered content, so delivery must use the same pre-rendered
    // content, not re-render later. Omitting templateId here selects pre-rendered mode.
    const notifyRequest = {
      params: personalisation,
      // reference isn't part of NotifySimpleRequest's shape, but is stashed here
      // (and read back by GcNotifyInternalExecutionService's read methods) so GET
      // /gcnotify/v2/notifications/{id} can round-trip the GC Notify reference field.
      reference: body.reference,
      email: {
        recipients: { to: [body.email_address] },
        params: personalisation,
        content: {
          subject: content.subject,
          body: content.deliveryBody,
          // Already GC Notify's HTML, so delivery must pass it through rather than run the
          // CommonMark converter over it - that would escape every tag into visible markup.
          bodyType: 'html' as const,
        },
        ...(attachments.length > 0 && { attachments }),
        delayedSend: body.scheduled_for,
      },
    }

    // One email_address per request, so one message. Checked before the send is accepted and
    // recorded after, the same order the @Queueable path uses.
    const usage = [{ channel: NotificationChannel.EMAIL, count: 1 }]
    const { id } = duplicate
      ? { id: duplicate.notifyId }
      : await this.acceptSend(
          tenantId,
          notifyRequest,
          body.scheduled_for,
          requestRoute,
          fingerprint,
          apiKeyConsumerId,
          usage,
        )

    return {
      id,
      reference: body.reference ?? null,
      content: {
        from_email: fromEmail,
        body: content.responseBody,
        subject: content.subject,
      },
      uri: `/gcnotify/v2/notifications/${id}`,
      template: {
        id: template.id,
        version: template.version,
        uri: `/gcnotify/v2/template/${template.id}`,
      },
      scheduled_for: body.scheduled_for,
    }
  }

  async sendSms(
    body: CreateSmsNotificationRequest,
    tenantId: string,
    apiKeyConsumerId?: string,
    requestRoute?: string,
  ): Promise<NotificationResponse> {
    const template = await this.requireTemplate(tenantId, body.template_id, NotificationChannel.SMS)
    const personalisation = this.toTemplateParams(body.personalisation)
    const rendered = await this.renderWithLegacyGcNotifyEngine(template, personalisation)
    const fromNumber = await this.resolveDefaultSender('gc_notify_default_sms_sender')

    // Before segment counting, which renders the body.
    const { fingerprint, duplicate } = await findDuplicateSend(this.queueableContext(), tenantId, {
      sms: { recipients: { to: [body.phone_number] } },
      gcNotify: { ...body, phone_number: undefined, templateVersion: template.version },
    })

    const notifyRequest = {
      params: personalisation,
      reference: body.reference,
      sms: {
        recipients: { to: [body.phone_number] },
        params: personalisation,
        content: {
          body: rendered.body,
        },
        delayedSend: body.scheduled_for,
      },
    }

    // An SMS is billed per segment, not per message: a long body is concatenated and the carrier
    // charges for each part. resolveSmsSegments fails open at 1 rather than failing the send.
    const { id } = duplicate
      ? { id: duplicate.notifyId }
      : await this.acceptSend(
          tenantId,
          notifyRequest,
          body.scheduled_for,
          requestRoute,
          fingerprint,
          apiKeyConsumerId,
          [
            {
              channel: NotificationChannel.SMS,
              count: await resolveSmsSegments(this.queueableContext(), tenantId, notifyRequest),
            },
          ],
        )

    return {
      id,
      reference: body.reference,
      content: {
        body: rendered.body,
        from_number: fromNumber,
      },
      uri: `/gcnotify/v2/notifications/${id}`,
      template: {
        id: template.id,
        version: template.version,
        uri: `/gcnotify/v2/template/${template.id}`,
      },
      scheduled_for: body.scheduled_for,
    }
  }

  /**
   * GC Notify-compatible bulk send.
   *
   * Reuses the ordinary mail-merge path rather than reimplementing it: `handleMerge` already
   * extracts recipients, applies the safelist, counts SMS segments, creates the notification
   * record and enqueues the ingestion fan-out. This method's job is only translation - GC Notify's
   * request shape in, GC Notify's job shape out.
   *
   * The template decides the channel. GC Notify infers it from the header column, but a bulk send
   * names a template, and a template is already email or SMS.
   */
  async sendBulk(
    body: PostBulkRequest,
    tenantId: string,
    apiKeyConsumerId?: string,
    requestRoute?: string,
  ): Promise<PostBulkResponse> {
    const template = await this.requireTemplate(tenantId, body.template_id)
    const channel = template.channelCode as NotificationChannel
    const rows = this.resolveBulkRows(body)

    // Unconditional, as the controller did before: the validator self-selects on the header row,
    // returning valid for an email-shaped bulk and checking E.164 for a phone-shaped one.
    const validation = this.bulkValidationService.validateRows(rows)
    if (!validation.valid) {
      throw new UnprocessableEntityException({
        errors: validation.errors.map((message) => ({
          error: 'ValidationError',
          message,
        })),
      })
    }

    const mergeArray = this.toMergeArray(rows)
    const channelPayload = {
      recipients: { mergeArray },
      content: { templateId: template.id },
      ...(body.scheduled_for && { delayedSend: body.scheduled_for }),
    }
    const notifyRequest = (channel === NotificationChannel.SMS
      ? { sms: channelPayload, reference: body.reference }
      : { email: channelPayload, reference: body.reference }) as unknown as NotifySimpleRequest

    const accepted = (await handleMerge(
      this.queueableContext(),
      this.ingestionQueue as unknown as Bull.Queue,
      QueueName.INGESTION,
      tenantId,
      notifyRequest,
      apiKeyConsumerId,
      requestRoute,
      channel,
    )) as { notifyId: string; recipientCount: number; createdAt: Date }

    // created_by, api_key, service_name and sender_id are deliberately absent: GC Notify fills them
    // from its own user and key model, and inventing values here would misreport who sent what.
    return {
      data: {
        id: accepted.notifyId,
        template: template.id,
        job_status: 'pending',
        // A duplicate carries no count; an identical request has the same rows.
        notification_count: accepted.recipientCount ?? mergeArray.length - 1,
        original_file_name: body.name,
        template_version: template.version,
        template_type: channel === NotificationChannel.SMS ? 'sms' : 'email',
        created_at: (accepted.createdAt ?? new Date()).toISOString(),
        ...(body.scheduled_for && { scheduled_for: body.scheduled_for }),
        archived: false,
      },
    }
  }

  /**
   * The rows to send, from whichever form the caller used. GC Notify accepts `rows` or a raw `csv`
   * string and the schema requires exactly one of them.
   */
  private resolveBulkRows(body: PostBulkRequest): string[][] {
    if (body.rows) {
      return body.rows
    }

    // `skipEmptyLines` because a trailing newline is normal in an uploaded file and would otherwise
    // become a row of empty strings - a recipient with no address.
    const parsed = Papa.parse<string[]>(body.csv ?? '', { skipEmptyLines: true })
    if (parsed.errors.length > 0) {
      throw new BadRequestException({
        errors: parsed.errors.slice(0, 10).map((error) => ({
          error: 'ValidationError',
          message: `csv could not be parsed: ${error.message} (row ${error.row ?? 0})`,
        })),
      })
    }
    if (parsed.data.length < 2) {
      throw new BadRequestException({
        errors: [
          {
            error: 'ValidationError',
            message: 'csv must have a header row and at least one data row',
          },
        ],
      })
    }
    return parsed.data
  }

  /**
   * GC Notify names the recipient column `email address` or `phone number`; the merge pipeline
   * requires it to be called `to`. Every other column is personalisation and passes through as-is.
   */
  private toMergeArray(rows: string[][]): string[][] {
    const [header, ...dataRows] = rows
    const recipientColumn = header.findIndex((column) =>
      ['email address', 'phone number'].includes(
        String(column ?? '')
          .trim()
          .toLowerCase(),
      ),
    )

    if (recipientColumn === -1) {
      throw new BadRequestException({
        errors: [
          {
            error: 'ValidationError',
            message:
              'The header row must contain an "email address" or "phone number" column naming the recipient',
          },
        ],
      })
    }

    const mappedHeader = header.map((column, index) => (index === recipientColumn ? 'to' : column))
    return [mappedHeader, ...dataRows]
  }

  /**
   * The queueable context `handleMerge` needs. `apiKeyUsageService` and `smsSegmentService` are
   * what make a bulk send count: the first checks the key's limits before accepting and records the
   * usage after, the second prices an SMS in billable segments rather than one per recipient.
   *
   * `limitAlertNotificationService` is absent, so crossing a threshold is recorded but does not
   * send the alert email `/notifysimple` would.
   */
  private queueableContext(): QueueableContext {
    return {
      notificationService: this.notificationService,
      attachmentValidationService: this.attachmentValidationService,
      attachmentProcessingService: this.attachmentProcessingService,
      safelistService: this.safelistService,
      notificationRequestDetailService: this.notificationRequestDetailService,
      apiKeyUsageService: this.apiKeyUsageService,
      smsSegmentService: this.smsSegmentService,
      notificationDedupService: this.notificationDedupService,
      queueMap: new Map([[QueueName.INGESTION, this.ingestionQueue as unknown as Bull.Queue]]),
    }
  }

  private async requireTemplate(
    tenantId: string,
    templateId: string,
    channel?: NotificationChannel,
  ): Promise<Template> {
    const template = await this.templatesRepository.findById(tenantId, templateId)
    if (!template || (channel !== undefined && template.channelCode !== channel)) {
      throw new BadRequestException({
        errors: [{ error: 'ValidationError', message: 'Template not found' }],
      })
    }
    return template
  }

  private async renderWithLegacyGcNotifyEngine(
    template: Template,
    personalisation: Record<string, unknown>,
  ): Promise<{ subject?: string; body: string; bodyType: 'text' | 'markdown' | 'html' }> {
    // GC Notify routes always use GC Notify placeholder semantics ((key)) and ((key??content)),
    // regardless of the stored template engine. GC_NOTIFY_NATIVE rather than LEGACY_GC_NOTIFY:
    // the legacy engine is a public `renderer` option on the ordinary notify API and must keep
    // its current behaviour for callers who are not talking to these routes.
    return this.templatesService.renderTemplateContent(
      {
        ...template,
        engineCode: TemplateEngine.GC_NOTIFY_NATIVE,
      },
      personalisation,
    )
  }

  /**
   * The body and subject a GC Notify email send delivers.
   *
   * The body is rendered to HTML here rather than left as markdown for the CHES adapter, because
   * the adapter renders CommonMark - which is not what GC Notify renders. Handing delivery
   * finished HTML keeps that dialect on these routes only. Our own generated HTML, so the
   * caller-HTML sanitiser does not apply and must not: it would strip the inline styles GC Notify
   * puts on headings and links.
   *
   * The 201 response keeps the unrendered body, which is the form GC Notify reports.
   */
  private renderGcNotifyEmailContent(rendered: { subject?: string; body: string }): {
    responseBody: string
    deliveryBody: string
    subject: string
  } {
    return {
      responseBody: rendered.body,
      deliveryBody: toGcNotifyEmailHtml(rendered.body),
      subject: toGcNotifySubject(rendered.subject ?? ''),
    }
  }

  private toTemplateParams(
    personalisation: Record<string, unknown> | undefined,
  ): Record<string, TemplateParamValue> {
    return this.splitPersonalisation(personalisation).params
  }

  /**
   * GC Notify overloads the personalisation map: each entry is either a template
   * variable (a string, or an array the renderer writes out as a list) or a file
   * attachment (object). Split them - variables feed template rendering; file-valued
   * entries become attachments. Any other value is dropped rather than stringified
   * into garbage.
   *
   * An array is passed through untouched rather than coerced item by item: the legacy
   * renderer drops empty items itself, and `String(null)` here would turn one into the
   * printable item "null".
   */
  private splitPersonalisation(personalisation: Record<string, unknown> | undefined): {
    params: Record<string, TemplateParamValue>
    files: FileAttachment[]
  } {
    const params: Record<string, TemplateParamValue> = {}
    const files: FileAttachment[] = []
    if (!personalisation) return { params, files }
    for (const [key, value] of Object.entries(personalisation)) {
      if (typeof value === 'string' || Array.isArray(value)) {
        params[key] = value
      } else if (this.isFileAttachment(value)) {
        files.push(value)
      }
    }
    return { params, files }
  }

  private isFileAttachment(value: unknown): value is FileAttachment {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as FileAttachment).file === 'string' &&
      typeof (value as FileAttachment).filename === 'string'
    )
  }

  /**
   * Validate and persist GC Notify file attachments through the shared attachment
   * pipeline, returning the stored-attachment references to enqueue on the email
   * payload (the ingestion/delivery workers resolve these downstream). Returns an
   * empty array when there are no attachments, so callers can omit the field.
   */
  private async storeAttachments(
    files: FileAttachment[],
    tenantId: string,
  ): Promise<StoredNotifyAttachment[]> {
    if (files.length === 0) return []

    const notifyAttachments = files.map((file) => this.toNotifyAttachment(file))
    // Only email.attachments is populated; the shared services read exactly that,
    // so the required-but-unused recipients field is intentionally left off.
    const request: NotifySimpleRequest = {
      email: { attachments: notifyAttachments } as NotifyEmailChannel,
    }
    await this.attachmentValidationService.validateAttachments(request)
    const processed = await this.attachmentProcessingService.processAttachments(
      request,
      tenantId,
      tenantId,
    )
    return processed.email?.attachments ?? []
  }

  private toNotifyAttachment(file: FileAttachment): NotifyAttachment {
    // sending_method is optional at runtime (personalisation isn't deeply validated
    // by class-validator); treat a missing method as the default 'attach'.
    if (file.sending_method && file.sending_method !== 'attach') {
      throw new BadRequestException({
        errors: [
          {
            error: 'ValidationError',
            message: `Attachment '${file.filename}' uses sending_method '${file.sending_method}', which is not supported by internal execution. Use sending_method 'attach'.`,
          },
        ],
      })
    }
    return {
      filename: file.filename,
      mimeType: this.deriveMimeType(file.filename),
      content: file.file,
    }
  }

  private deriveMimeType(filename: string): string {
    const extension = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : ''
    const mimeType = GC_NOTIFY_EXTENSION_MIME_TYPES[extension]
    if (!mimeType) {
      throw new BadRequestException({
        errors: [
          {
            error: 'BadRequestError',
            message: `Attachment '${filename}' has an unsupported or missing file extension. Allowed extensions: ${Object.keys(
              GC_NOTIFY_EXTENSION_MIME_TYPES,
            ).join(', ')}.`,
          },
        ],
      })
    }
    return mimeType
  }

  private async resolveDefaultSender(configKey: string): Promise<string> {
    const config = await this.configurationRepository.findOne({ where: { key: configKey } })
    const value = config?.config?.value
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
    this.logger.warn(
      `No ${configKey} configured - returning placeholder sender. Configure this in notify.configuration before relying on internal execution responses.`,
    )
    return 'not-configured@example.com'
  }

  /**
   * Reject a send that would reach a recipient this tenant has not safelisted, in the GC Notify
   * error shape. Mirrors the @Queueable guardrail so the compatibility routes cannot be used to
   * step around it. Does nothing when the safelist is not enforced in this environment.
   */
  private async enforceSafelist(
    tenantId: string,
    notifyRequest: Record<string, unknown>,
  ): Promise<void> {
    const email = (notifyRequest as { email?: { recipients?: { to?: string[] } } }).email
    const sms = (notifyRequest as { sms?: { recipients?: { to?: string[] } } }).sms
    const candidates = [
      ...(email?.recipients?.to ?? []).map((address) => ({
        address,
        channel: NotificationChannel.EMAIL,
      })),
      ...(sms?.recipients?.to ?? []).map((address) => ({
        address,
        channel: NotificationChannel.SMS,
      })),
    ]

    const blocked = await this.safelistService.findBlocked(tenantId, candidates)
    if (blocked.length === 0) return

    // Count only — recipient values are not logged.
    this.logger.warn(
      `Rejected GC Notify send: ${blocked.length} recipient(s) not safelisted (tenant=${tenantId})`,
    )
    throw new BadRequestException({
      errors: [
        {
          error: 'ValidationError',
          message: `Recipient(s) not on this tenant's safelist: ${blocked.join(', ')}. This environment only sends to safelisted recipients.`,
        },
      ],
    })
  }

  /**
   * A single send in the @Queueable order: limits checked before accepting, usage recorded
   * after. A send that turns out to be a duplicate at the claim is neither created nor counted.
   */
  private async acceptSend(
    tenantId: string,
    notifyRequest: Record<string, unknown>,
    scheduledFor: string | undefined,
    requestRoute: string | undefined,
    fingerprint: string | undefined,
    apiKeyConsumerId: string | undefined,
    usage: Array<{ channel: string; count: number }>,
  ): Promise<{ id: string }> {
    await enforceLimits(this.queueableContext(), apiKeyConsumerId, usage)

    const accepted = await this.createAndEnqueue(
      tenantId,
      notifyRequest,
      scheduledFor,
      requestRoute,
      fingerprint,
    )

    if (!accepted.duplicate) {
      await recordAcceptedUsage(this.queueableContext(), apiKeyConsumerId, usage)
    }
    return accepted
  }

  /**
   * Mirrors the create-then-enqueue pattern from @Queueable: synchronously create
   * a durable notification_request record (PENDING), then enqueue the ingestion
   * job asynchronously so the response isn't blocked on queue availability.
   */
  private async createAndEnqueue(
    tenantId: string,
    notifyRequest: Record<string, unknown>,
    scheduledFor: string | undefined,
    requestRoute: string | undefined,
    fingerprint: string | undefined,
  ): Promise<{ id: string; duplicate: boolean }> {
    // Non-production guardrail, enforced at this single choke point so any future send method
    // routed through here is covered too. No-op in PROD, where the safelist is not enforced.
    await this.enforceSafelist(tenantId, notifyRequest)

    // Last before the create, so nothing that can still reject the send runs after the claim.
    const claim = await claimSend(this.queueableContext(), tenantId, fingerprint)
    if (claim.kind === 'duplicate') {
      return { id: claim.original.notifyId, duplicate: true }
    }

    let notificationRecord
    try {
      notificationRecord = await this.notificationService.create({
        ...(claim.notifyId && { id: claim.notifyId }),
        tenantId,
        status: NotificationStatus.PENDING,
        createdBy: tenantId,
        payload: notifyRequest,
        requestRoute,
      })
    } catch (error) {
      await claim.release()
      throw error
    }

    const hasDelayedSend = !!scheduledFor
    const delayMs = hasDelayedSend
      ? Math.max(0, new Date(scheduledFor as string).getTime() - Date.now())
      : 0

    setImmediate(async () => {
      try {
        const jobPayload: IngestionJobPayload = {
          notifyId: notificationRecord.id,
          tenantId,
          request: notifyRequest as any,
          requestedAt: new Date().toISOString(),
          ...(scheduledFor && { scheduledFor }),
        }

        await this.ingestionQueue.add(jobPayload, {
          jobId: notificationRecord.id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: COMPLETED_JOB_RETENTION,
          removeOnFail: FAILED_JOB_RETENTION,
          ...(delayMs > 0 && { delay: delayMs }),
        })

        const statusAfterQueuing = hasDelayedSend
          ? NotificationStatus.SCHEDULED
          : NotificationStatus.QUEUED

        await this.notificationService.update(notificationRecord.id, tenantId, {
          status: statusAfterQueuing,
          updatedBy: 'system',
        })
        await this.notificationRequestDetailService.updateStatus(
          notificationRecord.id,
          statusAfterQueuing,
        )
      } catch (error) {
        // Redis unavailable - record stays PENDING and is picked up by the
        // existing scheduled retry job, same as @Queueable's fallback.
        this.logger.warn(
          `Failed to enqueue GC Notify job (will be retried): ${notificationRecord.id}`,
          {
            tenantId,
            error: (error as Error).message,
          },
        )
      }
    })

    return { id: notificationRecord.id, duplicate: false }
  }

  // ----------------------------------------------------------------------
  // Read operations
  // ----------------------------------------------------------------------

  async getNotificationById(notificationId: string, tenantId: string): Promise<GcNotification> {
    const entity = await this.notificationService.findOne(notificationId, tenantId)
    return this.toGcNotification(entity as unknown as MappableNotification)
  }

  /**
   * `older_than` (keyset pagination) and `include_jobs` aren't honoured - internal
   * execution falls back to page-based pagination starting at page 1. `reference`
   * isn't a queryable column (it lives inside the JSONB payload), so it isn't
   * filtered on either. These are accepted, documented gaps for the MVP; passthrough
   * mode is unaffected since it talks to the real GC Notify API directly.
   */
  async getNotifications(
    query: {
      template_type?: 'sms' | 'email'
      status?: string[]
      reference?: string
      older_than?: string
      include_jobs?: boolean
    },
    tenantId: string,
    tenantExternalId: string,
  ): Promise<{ notifications: GcNotification[]; links: Links }> {
    const filters: string[] = []
    if (query.template_type) {
      filters.push(`channelCode:eq:${query.template_type.toUpperCase()}`)
    }
    if (query.status?.length) {
      const internalStatuses = Array.from(
        new Set(query.status.flatMap((s) => GC_NOTIFY_QUERY_STATUS_TO_INTERNAL[s] ?? [])),
      )
      if (internalStatuses.length) {
        filters.push(`status:in:${internalStatuses.join(',')}`)
      }
    }

    const listQuery = {
      page: 1,
      limit: 50,
      filter: filters.length ? filters : undefined,
    } as ListQueryDto
    const result = await this.notificationService.findAll(tenantExternalId, listQuery)

    const notifications = await Promise.all(
      result.data.map((dto) =>
        this.toGcNotification({ ...dto, tenantId } as unknown as MappableNotification),
      ),
    )

    return {
      notifications,
      links: {
        current: '/gcnotify/v2/notifications',
        next:
          result.page < result.totalPages
            ? `/gcnotify/v2/notifications?page=${result.page + 1}`
            : undefined,
      },
    }
  }

  async getTemplate(templateId: string, tenantId: string): Promise<GcTemplate> {
    const dto = await this.templatesService.getTemplate(tenantId, templateId)
    return this.toGcTemplate(dto)
  }

  async getTemplates(
    type: 'sms' | 'email' | undefined,
    tenantId: string,
  ): Promise<{ templates: GcTemplate[] }> {
    const filters = type ? [`channelCode:eq:${type.toUpperCase()}`] : undefined
    const listQuery = { page: 1, limit: 100, filter: filters } as ListQueryDto
    const parsedQuery = parseListQuery(listQuery, TEMPLATE_LIST_QUERY_CONFIG)
    const result = await this.templatesService.listTemplates(tenantId, parsedQuery)
    return { templates: result.data.map((dto) => this.toGcTemplate(dto)) }
  }

  private async toGcNotification(entity: MappableNotification): Promise<GcNotification> {
    const channel = entity.channelCode === NotificationChannel.SMS ? 'sms' : 'email'
    const templateId = entity.payload?.templateId
    const params = entity.payload?.params ?? {}

    let body = ''
    let subject: string | undefined
    let templateVersion = 1
    if (templateId) {
      const template = await this.templatesRepository.findById(entity.tenantId, templateId)
      if (template) {
        const rendered = await this.renderWithLegacyGcNotifyEngine(template, params)
        body = rendered.body
        subject = rendered.subject
        templateVersion = template.version
      }
    }

    return {
      id: entity.id,
      reference: entity.payload?.reference,
      email_address: channel === 'email' ? entity.recipients?.email?.[0] : undefined,
      phone_number: channel === 'sms' ? entity.recipients?.sms?.[0] : undefined,
      type: channel,
      status: toGcNotifyResponseStatus(entity.status),
      template: {
        id: templateId ?? '',
        version: templateVersion,
        uri: templateId ? `/gcnotify/v2/template/${templateId}` : '',
      },
      body,
      subject: channel === 'email' ? subject : undefined,
      created_at: entity.createdAt.toISOString(),
      scheduled_for: entity.delayedSendTime ? entity.delayedSendTime.toISOString() : undefined,
    }
  }

  private toGcTemplate(dto: TemplateResponseDto): GcTemplate {
    return {
      id: dto.id,
      name: dto.name,
      description: dto.description,
      type: dto.channelCode === NotificationChannel.SMS ? 'sms' : 'email',
      subject: dto.subject,
      body: dto.body,
      active: dto.active,
      created_at: dto.createdAt.toISOString(),
      updated_at: dto.updatedAt ? dto.updatedAt.toISOString() : undefined,
      created_by: dto.createdBy,
    }
  }
}
