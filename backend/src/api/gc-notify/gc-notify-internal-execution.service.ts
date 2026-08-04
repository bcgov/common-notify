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
import { ListQueryDto } from '../../common/query/list-query.dto'
import { parseListQuery } from '../../common/query/list-query.parser'
import type { QueryableFieldsConfig } from '../../common/query/list-query.types'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplateEngine } from '../../enum/template-engine.enum'
import { QueueName } from '../../enum/queue-name.enum'
import { IngestionJobPayload } from '../../queue/queue.types'
import { CreateEmailNotificationRequest } from './schemas/create-email-notification-request'
import { CreateSmsNotificationRequest } from './schemas/create-sms-notification-request'
import { NotificationResponse } from './schemas/notification-response'
import { Notification as GcNotification } from './schemas/notification'
import { Template as GcTemplate } from './schemas/template'
import { Links } from './schemas/links'
import type { FileAttachment } from './schemas/file-attachment'
import { AttachmentValidationService } from '../notify/services/attachment-validation.service'
import { AttachmentProcessingService } from '../notify/services/attachment-processing.service'
import type { NotifySimpleRequest } from '../notify/schemas/notify-simple-request'
import type { NotifyAttachment } from '../notify/schemas/notify-attachment'
import type { StoredNotifyAttachment } from '../notify/schemas/stored-notify-attachment'

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
    @InjectRepository(NotifyConfiguration)
    private readonly configurationRepository: Repository<NotifyConfiguration>,
    @Inject(QueueName.INGESTION) private readonly ingestionQueue: Bull.Queue<IngestionJobPayload>,
    private readonly attachmentValidationService: AttachmentValidationService,
    private readonly attachmentProcessingService: AttachmentProcessingService,
  ) {}

  async sendEmail(
    body: CreateEmailNotificationRequest,
    tenantId: string,
  ): Promise<NotificationResponse> {
    const template = await this.requireTemplate(
      tenantId,
      body.template_id,
      NotificationChannel.EMAIL,
    )
    const { params: personalisation, files } = this.splitPersonalisation(body.personalisation)
    const rendered = await this.renderWithLegacyGcNotifyEngine(template, personalisation)
    const fromEmail = await this.resolveDefaultSender('gc_notify_default_from_email')
    const attachments = await this.storeAttachments(files, tenantId)
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
          subject: rendered.subject ?? '',
          body: rendered.body,
          // Carry the rendered body type through to delivery. Without it the CHES
          // adapter can't tell the body is markdown, skips markdown->HTML conversion,
          // and ships raw markdown (## H1, **bold**, - lists) in the email.
          bodyType: rendered.bodyType,
        },
        ...(attachments.length > 0 && { attachments }),
        delayedSend: body.scheduled_for,
      },
    }

    const notificationRecord = await this.createAndEnqueue(
      tenantId,
      notifyRequest,
      body.scheduled_for,
    )

    return {
      id: notificationRecord.id,
      reference: body.reference ?? null,
      content: {
        from_email: fromEmail,
        body: rendered.body,
        subject: rendered.subject ?? '',
      },
      uri: `/gcnotify/v2/notifications/${notificationRecord.id}`,
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
  ): Promise<NotificationResponse> {
    const template = await this.requireTemplate(tenantId, body.template_id, NotificationChannel.SMS)
    const personalisation = this.toStringPersonalisation(body.personalisation)
    const rendered = await this.renderWithLegacyGcNotifyEngine(template, personalisation)
    const fromNumber = await this.resolveDefaultSender('gc_notify_default_sms_sender')

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

    const notificationRecord = await this.createAndEnqueue(
      tenantId,
      notifyRequest,
      body.scheduled_for,
    )

    return {
      id: notificationRecord.id,
      reference: body.reference,
      content: {
        body: rendered.body,
        from_number: fromNumber,
      },
      uri: `/gcnotify/v2/notifications/${notificationRecord.id}`,
      template: {
        id: template.id,
        version: template.version,
        uri: `/gcnotify/v2/template/${template.id}`,
      },
      scheduled_for: body.scheduled_for,
    }
  }

  private async requireTemplate(
    tenantId: string,
    templateId: string,
    channel: NotificationChannel,
  ): Promise<Template> {
    const template = await this.templatesRepository.findById(tenantId, templateId)
    if (!template || template.channelCode !== channel) {
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
    // GC Notify routes always use legacy GC Notify placeholder semantics ((key))
    // and ((key??default)), regardless of the stored template engine.
    return this.templatesService.renderTemplateContent(
      {
        ...template,
        engineCode: TemplateEngine.LEGACY_GC_NOTIFY,
      },
      personalisation,
    )
  }

  private toStringPersonalisation(
    personalisation: Record<string, unknown> | undefined,
  ): Record<string, string> {
    return this.splitPersonalisation(personalisation).params
  }

  /**
   * GC Notify overloads the personalisation map: each entry is either a template
   * variable (string) or a file attachment (object). Split them - string values
   * feed template rendering; file-valued entries become attachments. Any other
   * non-string value is dropped rather than stringified into garbage (unchanged
   * from the previous string-only behaviour).
   */
  private splitPersonalisation(personalisation: Record<string, unknown> | undefined): {
    params: Record<string, string>
    files: FileAttachment[]
  } {
    const params: Record<string, string> = {}
    const files: FileAttachment[] = []
    if (!personalisation) return { params, files }
    for (const [key, value] of Object.entries(personalisation)) {
      if (typeof value === 'string') {
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
    // Only email.attachments is populated; the shared services read exactly that.
    const request: NotifySimpleRequest = { email: { attachments: notifyAttachments } }
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
          }
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
   * Mirrors the create-then-enqueue pattern from @Queueable: synchronously create
   * a durable notification_request record (PENDING), then enqueue the ingestion
   * job asynchronously so the response isn't blocked on queue availability.
   */
  private async createAndEnqueue(
    tenantId: string,
    notifyRequest: Record<string, unknown>,
    scheduledFor: string | undefined,
  ): Promise<{ id: string; createdAt: Date }> {
    const notificationRecord = await this.notificationService.create({
      tenantId,
      status: NotificationStatus.PENDING,
      createdBy: tenantId,
      payload: notifyRequest,
    })

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
          removeOnComplete: false,
          removeOnFail: false,
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

    return notificationRecord
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
