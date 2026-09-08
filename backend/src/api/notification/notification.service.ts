import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { NotificationRequest } from './entities/notification-request.entity'
import {
  CreateNotificationRequestDto,
  NotificationStatus,
} from './schemas/create-notification-request'
import { UpdateNotificationRequestDto } from './schemas/update-notification-request'
import { NotificationRequestDto } from './schemas/notification-request'
import { PaginatedNotificationResponse } from './schemas/paginated-response'
import { isEmail } from 'class-validator'
import { NotifySimpleRequest } from '../notify/schemas/notify-simple-request'
import { ProcessedNotifySimpleRequest } from '../notify/schemas/stored-notify-attachment'
import { MAIL_MERGE_MAX_REPORTED_ERRORS } from '../notify/schemas/mail-merge.constants'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { PhoneNumberService } from '../notify/services/phone-number.service'
import { TenantsService } from '../admin/tenants/tenants.service'
import { NotificationPubSubService } from './notification-pubsub.service'
import { TemplatesRepository } from '../templates/templates.repository'
import { TemplatesService } from '../templates/templates.service'
import { ListQueryDto } from '../../common/query/list-query.dto'
import { parseListQuery } from '../../common/query/list-query.parser'
import { applyParsedListQueryToQueryBuilder } from '../../common/query/typeorm-list-query.util'
import type { QueryableFieldsConfig } from '../../common/query/list-query.types'

const notificationListQueryConfig: QueryableFieldsConfig = {
  sortableFields: {
    createdAt: 'notification.createdAt',
    updatedAt: 'notification.updatedAt',
    status: 'notification.status',
  },
  filterableFields: {
    status: {
      column: 'notification.status',
      valueType: 'string',
      operators: ['eq', 'ne', 'in'],
    },
    createdAt: {
      column: 'notification.createdAt',
      valueType: 'date',
      operators: ['gte', 'lte'],
    },
    createdBy: {
      column: 'notification.createdBy',
      valueType: 'string',
      operators: ['eq', 'like', 'isnull'],
    },
  },
  defaultSort: [{ field: 'createdAt', direction: 'DESC' }],
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name)

  // Validation limits (configurable via environment variables)
  private readonly emailMaxRecipients: number
  private readonly emailMaxSubjectLength: number
  private readonly emailMaxBodyLength: number
  private readonly smsMaxRecipients: number
  private readonly smsMaxBodyLength: number
  private readonly msgAppMaxRecipients: number
  private readonly msgAppMaxBodyLength: number

  // Stateless helper, instantiated rather than injected so the constructor signature (and every
  // spec that builds this service) stays put.
  private readonly phoneNumberService = new PhoneNumberService()

  constructor(
    @InjectRepository(NotificationRequest)
    private readonly notificationRepository: Repository<NotificationRequest>,
    private readonly tenantsService: TenantsService,
    private readonly configService: ConfigService,
    private readonly templatesRepository: TemplatesRepository,
    private readonly templatesService: TemplatesService,
    private readonly notificationPubSubService: NotificationPubSubService,
  ) {
    // Load validation limits from environment variables with sensible defaults
    this.emailMaxRecipients = this.configService.get<number>('VALIDATE_EMAIL_MAX_RECIPIENTS') ?? 100
    this.emailMaxSubjectLength =
      this.configService.get<number>('VALIDATE_EMAIL_MAX_SUBJECT_LENGTH') ?? 500
    this.emailMaxBodyLength =
      this.configService.get<number>('VALIDATE_EMAIL_MAX_BODY_LENGTH') ?? 50000
    this.smsMaxRecipients = this.configService.get<number>('VALIDATE_SMS_MAX_RECIPIENTS') ?? 50
    this.smsMaxBodyLength = this.configService.get<number>('VALIDATE_SMS_MAX_BODY_LENGTH') ?? 1600
    this.msgAppMaxRecipients =
      this.configService.get<number>('VALIDATE_MSGAPP_MAX_RECIPIENTS') ?? 100
    this.msgAppMaxBodyLength =
      this.configService.get<number>('VALIDATE_MSGAPP_MAX_BODY_LENGTH') ?? 50000
  }

  /**
   * Maps NotificationRequest entity to NotificationRequestDto with tenant data
   */
  mapToDto(entity: NotificationRequest): NotificationRequestDto {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      status: entity.statusCode
        ? {
            code: entity.statusCode.code,
            displayName: entity.statusCode.displayName,
            description: entity.statusCode.description,
          }
        : { code: entity.status, displayName: entity.status },
      channelCodes: entity.channelCodes,
      requestRoute: entity.requestRoute,
      recipients: entity.recipients,
      delayedSendTime: entity.delayedSendTime,
      payload: entity.payload,
      createdAt: entity.createdAt,
      createdBy: entity.createdBy,
      updatedAt: entity.updatedAt,
      updatedBy: entity.updatedBy,
      errorReason: entity.errorReason,
      tenant: entity.tenant
        ? {
            id: entity.tenant.id,
            name: entity.tenant.name,
            slug: entity.tenant.slug,
          }
        : undefined,
    }
  }

  /**
   * Extract channel code, recipients, and delayed send time from notification payload
   */
  /**
   * Extract channel code, recipients, and delayed send time from a mail merge email payload. Mail merge
   * sends are always a single EMAIL-channel request, with recipient addresses parsed from `mergeArray`
   * (mirroring how simple sends store their recipients on the parent request).
   */
  private extractMailMergeChannelAndRecipients(payload: NotifySimpleRequest): {
    channelCodes: string[] | null
    recipients: { email?: string[]; sms?: string[]; msgApp?: string[] } | null
    delayedSendTime: Date | null
  } {
    const email = payload.email
    const delayedSendTime = email?.delayedSend ? new Date(email.delayedSend) : null
    const parsed = this.parseMailMergeRecipients(email?.recipients?.mergeArray ?? [])
    const addresses = parsed.map((r) => r.address)
    return {
      channelCodes: ['EMAIL'],
      recipients: addresses.length > 0 ? { email: addresses } : null,
      delayedSendTime:
        delayedSendTime && !isNaN(delayedSendTime.getTime()) ? delayedSendTime : null,
    }
  }

  private extractChannelAndRecipients(
    payload: NotifySimpleRequest | ProcessedNotifySimpleRequest | undefined,
  ): {
    channelCodes: string[] | null
    recipients: { email?: string[]; sms?: string[]; msgApp?: string[] } | null
    delayedSendTime: Date | null
  } {
    if (!payload) {
      return { channelCodes: null, recipients: null, delayedSendTime: null }
    }

    const channels: string[] = []
    const recipients: { email?: string[]; sms?: string[]; msgApp?: string[] } = {}
    let delayedSendTime: Date | null = null

    // Extract email channel
    if (payload.email) {
      channels.push('EMAIL')
      recipients.email = [
        ...(payload.email.recipients?.to || []),
        ...(payload.email.recipients?.cc || []),
        ...(payload.email.recipients?.bcc || []),
      ]
      if (payload.email.delayedSend && !delayedSendTime) {
        delayedSendTime = new Date(payload.email.delayedSend)
      }
    }

    // Extract SMS channel
    if (payload.sms) {
      channels.push('SMS')
      recipients.sms = payload.sms.recipients?.to || []
      if (payload.sms.delayedSend && !delayedSendTime) {
        delayedSendTime = new Date(payload.sms.delayedSend)
      }
    }

    // Extract MsgApp channel
    if (payload.msgApp) {
      channels.push('MSGAPP')
      recipients.msgApp = payload.msgApp.recipients?.to || []
      if (payload.msgApp.delayedSend && !delayedSendTime) {
        delayedSendTime = new Date(payload.msgApp.delayedSend)
      }
    }

    return {
      channelCodes: channels.length > 0 ? channels : null,
      recipients: Object.keys(recipients).length > 0 ? recipients : null,
      delayedSendTime:
        delayedSendTime && !isNaN(delayedSendTime.getTime()) ? delayedSendTime : null,
    }
  }

  async create(dto: CreateNotificationRequestDto): Promise<NotificationRequest> {
    // Extract channel, recipients, and delayed send time from payload. Mail-merge sends (email
    // recipients given as `mergeArray`) take a dedicated extractor since the addressees live in the
    // merge rows rather than to/cc/bcc.
    const { channelCodes, recipients, delayedSendTime } = Array.isArray(
      dto.payload?.email?.recipients?.mergeArray,
    )
      ? this.extractMailMergeChannelAndRecipients(dto.payload as NotifySimpleRequest)
      : this.extractChannelAndRecipients(dto.payload)

    const notification = this.notificationRepository.create({
      tenantId: dto.tenantId,
      status: dto.status ?? NotificationStatus.QUEUED,
      createdBy: dto.createdBy,
      payload: dto.payload,
      channelCodes: channelCodes ?? undefined,
      isInternal: dto.isInternal ?? false,
      recipients: recipients,
      delayedSendTime: delayedSendTime,
      requestRoute: dto.requestRoute,
    })
    const saved = await this.notificationRepository.save(notification)
    this.logger.debug(`Created notification request: ${saved.id}`)
    // Reload with tenant relation for full data in SSE stream
    const fullNotification = await this.notificationRepository.findOne({
      where: { id: saved.id },
      relations: ['tenant'],
    })
    return fullNotification || saved
  }

  /**
   * Validate a mail merge request's business rules: the template must exist for the tenant and
   * every row's email address must be well-formed. Returns a bounded list of error strings
   * (empty when valid), mirroring validateBusinessRules so the caller can throw a 422.
   */
  async validateMailMergeRules(
    tenantId: string,
    dto: NotifySimpleRequest,
    channel: NotificationChannel = NotificationChannel.EMAIL,
  ): Promise<string[]> {
    const errors: string[] = []

    const isSms = channel === NotificationChannel.SMS
    const channelPayload = isSms ? dto.sms : dto.email
    const mergeArray = channelPayload?.recipients?.mergeArray ?? []
    const templateId = channelPayload?.content?.templateId
    const content = channelPayload?.content
    // An SMS has no subject, so inline content means a body.
    const hasInlineContent = !!(
      content &&
      (content.body || (!isSms && (content as { subject?: string }).subject))
    )

    const tenant = await this.tenantsService.findOne(tenantId)
    if (!tenant) {
      errors.push(`Tenant '${tenantId}' not found`)
      return errors
    }
    if (tenant.status !== 'active') {
      errors.push(`Tenant is not active (status: ${tenant.status})`)
    }

    // A merge renders from exactly one source: a server template or inline content.
    if (templateId && hasInlineContent) {
      errors.push(
        'Request must provide either a templateId or inline content (subject/body), not both',
      )
    } else if (templateId) {
      const template = await this.templatesRepository.findById(tenantId, templateId)
      if (!template) {
        errors.push(`Template '${templateId}' not found for tenant '${tenantId}'`)
      } else if (template.channelCode !== channel) {
        errors.push(`Template '${templateId}' is not a ${channel} template`)
      }
    } else if (!hasInlineContent) {
      errors.push(
        `Request must provide either a templateId or inline content (${isSms ? 'body' : 'subject/body'})`,
      )
    }

    if (channelPayload?.delayedSend) {
      const scheduledTime = new Date(channelPayload.delayedSend).getTime()
      const now = Date.now()
      if (scheduledTime <= now) {
        errors.push(`delayedSend must be in the future`)
      } else if (scheduledTime > now + 10 * 24 * 60 * 60 * 1000) {
        errors.push(`delayedSend must be within 10 days from now`)
      }
    }

    const header = mergeArray[0] ?? []
    if ((header[0] ?? '').trim().toLowerCase() !== 'to') {
      errors.push(`The first column of the header row must be "to"`)
      return errors
    }

    const seen = new Map<string, number>()
    for (let i = 1; i < mergeArray.length; i++) {
      if (errors.length >= MAIL_MERGE_MAX_REPORTED_ERRORS) {
        errors.push(
          `Additional invalid rows omitted (showing first ${MAIL_MERGE_MAX_REPORTED_ERRORS})`,
        )
        break
      }
      const address = (mergeArray[i]?.[0] ?? '').trim()
      // SMS rows are keyed by their E.164 form, so the same number written two ways is still a
      // duplicate; email rows are keyed case-insensitively.
      const normalised = isSms ? this.phoneNumberService.normalize(address) : address.toLowerCase()

      if (!address) {
        errors.push(`Row ${i}: ${isSms ? 'phone number' : 'email address'} is missing`)
      } else if (isSms ? normalised === null : !isEmail(address)) {
        errors.push(
          `Row ${i}: "${address}" is not a valid ${isSms ? 'phone number' : 'email address'}`,
        )
      } else {
        const key = normalised as string
        const firstSeen = seen.get(key)
        if (firstSeen !== undefined) {
          errors.push(`Row ${i}: "${address}" is a duplicate of row ${firstSeen}`)
        } else {
          seen.set(key, i)
        }
      }
    }

    return errors
  }

  /**
   * Parse the mergeArray into per-recipient data. Returns one entry per data row containing
   * the recipient address (from the "to" column) and any extra columns as template params.
   * Per-recipient params take precedence over global params when rendering.
   *
   * SMS addresses are normalised to E.164 here, through the same PhoneNumberService the non-merge
   * path uses in the ingestion worker. This is the single point every downstream consumer reads
   * from - segment counting, the safelist check, the per-recipient detail rows and the send itself
   * - so normalising once here keeps them all consistent. Without it a spreadsheet cell like
   * "2507447721" reached the transport unchanged, and ACS rejects anything that is not E.164.
   */
  parseMailMergeRecipients(
    mergeArray: string[][],
    channel: NotificationChannel = NotificationChannel.EMAIL,
  ): Array<{ address: string; params: Record<string, unknown> }> {
    const header = mergeArray[0] ?? []
    const isSms = channel === NotificationChannel.SMS
    return mergeArray.slice(1).map((row) => {
      const raw = (row[0] ?? '').trim()
      // Falls back to the raw value if it will not normalise; validateMailMergeRules has already
      // rejected those, so this only guards the ordering of the two calls.
      const address = isSms ? (this.phoneNumberService.normalize(raw) ?? raw) : raw
      const params: Record<string, unknown> = {}
      for (let i = 1; i < header.length; i++) {
        const key = (header[i] ?? '').trim()
        if (key) setMergeParam(params, key, row[i] ?? '')
      }
      return { address, params }
    })
  }

  /**
   * Parse `channelCodes:eq:...` / `channelCodes:in:A|B` filter tokens into a de-duplicated,
   * upper-cased list of channel codes (channel codes are stored canonical upper-case).
   */
  private extractChannelCodeFilterValues(filterTokens: string[] | undefined): string[] {
    const values = new Set<string>()
    for (const token of filterTokens ?? []) {
      if (!token.startsWith('channelCodes:')) continue
      const [, operator, ...rest] = token.split(':')
      if (operator !== 'eq' && operator !== 'in') continue
      for (const value of rest.join(':').split('|')) {
        const trimmed = value.trim()
        if (trimmed) values.add(trimmed.toUpperCase())
      }
    }
    return [...values]
  }

  async findAll(
    tenantExternalId: string,
    query: ListQueryDto,
  ): Promise<PaginatedNotificationResponse> {
    // channelCodes is a JSONB array, so it can't go through the generic scalar query builder.
    // Pull its filter tokens out here and apply them as containment checks below.
    const channelCodeValues = this.extractChannelCodeFilterValues(query.filter)
    const parsedQuery = parseListQuery(
      { ...query, filter: query.filter?.filter((token) => !token.startsWith('channelCodes:')) },
      notificationListQueryConfig,
    )

    const tenant = await this.tenantsService.findByExternalId(tenantExternalId)
    if (!tenant) {
      this.logger.warn(`Tenant not found with external ID: ${tenantExternalId}`)
      return {
        data: [],
        count: 0,
        page: parsedQuery.page,
        limit: parsedQuery.limit,
        totalPages: 0,
      }
    }
    this.logger.debug(
      `Found tenant: ID=${tenant.id}, name=${tenant.name}, externalId=${tenant.externalId}`,
    )
    const queryBuilder = this.notificationRepository
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.tenant', 'tenant')
      .leftJoinAndSelect('notification.statusCode', 'statusCode')
      .where('notification.tenantId = :tenantId', { tenantId: tenant.id })
      .andWhere('notification.isInternal = :isInternal', { isInternal: false })

    applyParsedListQueryToQueryBuilder(queryBuilder, parsedQuery, notificationListQueryConfig)

    // Match requests whose channel_codes array contains any of the requested channels.
    if (channelCodeValues.length > 0) {
      queryBuilder.andWhere(
        'jsonb_exists_any(notification.channel_codes, ARRAY[:...channelCodeValues]::text[])',
        { channelCodeValues },
      )
    }

    const [notifications, total] = await queryBuilder.getManyAndCount()

    const totalPages = Math.ceil(total / parsedQuery.limit)

    return {
      data: notifications.map((n) => this.mapToDto(n)),
      count: total,
      page: parsedQuery.page,
      limit: parsedQuery.limit,
      totalPages,
    }
  }

  async findOne(id: string, tenantId: string): Promise<NotificationRequest> {
    const notification = await this.notificationRepository.findOne({
      where: { id, tenantId },
      relations: ['tenant'],
    })
    if (!notification) {
      throw new NotFoundException(`Notification request with id '${id}' not found`)
    }
    return notification
  }

  /**
   * Retrieve a single notification request for a frontend user, scoped to their tenant.
   * Resolves the internal tenant from the external ID before delegating to findOne.
   */
  async findOneFrontend(id: string, tenantExternalId: string): Promise<NotificationRequestDto> {
    const tenant = await this.tenantsService.findByExternalId(tenantExternalId)
    if (!tenant) {
      throw new NotFoundException(`Notification request with id '${id}' not found`)
    }
    const notification = await this.findOne(id, tenant.id)
    return this.mapToDto(notification)
  }

  // Demo route, to be removed
  async getTenants(): Promise<any> {
    return this.tenantsService.findAll()
  }

  async update(
    id: string,
    tenantId: string,
    dto: UpdateNotificationRequestDto,
  ): Promise<NotificationRequest> {
    // Verify the record exists first
    await this.findOne(id, tenantId)

    // Build update object with only fields that were provided
    const updateData: any = {}
    if (dto.status !== undefined) updateData.status = dto.status
    if (dto.updatedBy !== undefined) updateData.updatedBy = dto.updatedBy
    if (dto.errorReason !== undefined) updateData.errorReason = dto.errorReason
    if (dto.quarantineDetails !== undefined) updateData.quarantineDetails = dto.quarantineDetails

    // Use query builder for explicit update (status field is part of FK constraint so TypeORM won't track it normally)
    await this.notificationRepository.update({ id, tenantId }, updateData)

    // Fetch and return updated record
    const updated = await this.findOne(id, tenantId)
    this.logger.log(`Updated notification request: ${id} (status=${dto.status})`)
    // Publish updated record to Redis so all pods can push updated entry to connected SSE clients
    await this.notificationPubSubService.publish(updated.tenantId, this.mapToDto(updated))
    return updated
  }

  /**
   * Validates business rules before queuing a notification.
   * This complements the DTO validation which only checks structure/format.
   *
   * Business rules checked:
   * - Tenant exists and is active
   * - At least one channel has recipients
   * - Recipients counts are within reasonable limits
   * - Content is present and reasonable length
   *
   * @param tenantId UUID of the tenant making the request
   * @param request The NotifySimpleRequest to validate
   * @returns Array of validation error messages (empty if valid)
   */
  async validateBusinessRules(
    tenantId: string,
    request: NotifySimpleRequest | ProcessedNotifySimpleRequest,
  ): Promise<string[]> {
    const errors: string[] = []

    // Verify tenant exists and is active
    const tenant = await this.tenantsService.findOne(tenantId)
    if (!tenant) {
      errors.push(`Tenant '${tenantId}' not found`)
      return errors // Stop here, can't proceed without valid tenant
    }

    if (tenant.status !== 'active') {
      errors.push(`Tenant is not active (status: ${tenant.status})`)
    }

    // Validate each channel's template. templateId lives in the channel's content, so each channel
    // is validated against its own expected channel code.
    const validateChannelTemplate = async (
      templateId: string,
      expectedChannelCode: 'EMAIL' | 'SMS' | 'MSGAPP',
    ): Promise<void> => {
      try {
        const template = await this.templatesRepository.findById(tenantId, templateId)
        if (!template) {
          errors.push(
            `Template '${templateId}' not found for tenant '${tenantId}'. Please verify the template ID is correct.`,
          )
        } else if (template.channelCode !== expectedChannelCode) {
          errors.push(
            `Template '${templateId}' has channel code '${template.channelCode}' but requested channel is '${expectedChannelCode}'.`,
          )
        } else if (expectedChannelCode === 'EMAIL' || expectedChannelCode === 'SMS') {
          await this.templatesService.renderTemplateContent(template as any, request.params ?? {})
        }
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error
        }
        errors.push(
          `Failed to validate template: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    const emailTemplateId = request.email?.content?.templateId
    const smsTemplateId = request.sms?.content?.templateId
    const msgAppTemplateId = request.msgApp?.content?.templateId

    if (emailTemplateId) await validateChannelTemplate(emailTemplateId, 'EMAIL')
    if (smsTemplateId) await validateChannelTemplate(smsTemplateId, 'SMS')
    if (msgAppTemplateId) await validateChannelTemplate(msgAppTemplateId, 'MSGAPP')

    // Ensure at least one channel has recipients
    const emailRecipients = request.email?.recipients?.to?.length ?? 0
    const smsRecipients = request.sms?.recipients?.to?.length ?? 0
    const msgAppRecipients = request.msgApp?.recipients?.to?.length ?? 0
    const totalRecipients = emailRecipients + smsRecipients + msgAppRecipients

    if (totalRecipients === 0) {
      errors.push('At least one recipient is required (email, SMS, or msgApp)')
    }

    // Validate email channel
    if (request.email?.recipients?.to) {
      if (request.email.recipients.to.length > this.emailMaxRecipients) {
        errors.push(
          `Too many email recipients (${request.email.recipients.to.length}). Max: ${this.emailMaxRecipients}`,
        )
      }

      // Only validate content if not using a template (template provides subject/body)
      if (!emailTemplateId) {
        if (!request.email.content?.subject?.trim()) {
          errors.push('Email subject cannot be empty')
        }

        if (
          request.email.content?.subject &&
          request.email.content.subject.length > this.emailMaxSubjectLength
        ) {
          errors.push(
            `Email subject too long (${request.email.content.subject.length}). Max: ${this.emailMaxSubjectLength}`,
          )
        }

        if (!request.email.content?.body?.trim()) {
          errors.push('Email body cannot be empty')
        }

        if (
          request.email.content?.body &&
          request.email.content.body.length > this.emailMaxBodyLength
        ) {
          errors.push(
            `Email body too long (${request.email.content.body.length}). Max: ${this.emailMaxBodyLength} characters`,
          )
        }
      }
    }

    // Validate SMS channel
    if (request.sms?.recipients?.to) {
      if (request.sms.recipients.to.length > this.smsMaxRecipients) {
        errors.push(
          `Too many SMS recipients (${request.sms.recipients.to.length}). Max: ${this.smsMaxRecipients}`,
        )
      }

      // Only validate content if not using a template (template provides body)
      if (!smsTemplateId) {
        if (!request.sms.content?.body?.trim()) {
          errors.push('SMS body cannot be empty')
        }

        if (request.sms.content?.body && request.sms.content.body.length > this.smsMaxBodyLength) {
          // SMS can be split across multiple messages, but warn if very long
          errors.push(
            `SMS body too long (${request.sms.content.body.length}). Max: ${this.smsMaxBodyLength} characters`,
          )
        }
      }
    }

    // Validate msgApp channel
    if (request.msgApp?.recipients?.to) {
      if (request.msgApp.recipients.to.length > this.msgAppMaxRecipients) {
        errors.push(
          `Too many msgApp recipients (${request.msgApp.recipients.to.length}). Max: ${this.msgAppMaxRecipients}`,
        )
      }

      // Only validate content if not using a template (template provides body)
      if (!msgAppTemplateId) {
        if (!request.msgApp.content?.body?.trim()) {
          errors.push('MsgApp body cannot be empty')
        }

        if (
          request.msgApp.content?.body &&
          request.msgApp.content.body.length > this.msgAppMaxBodyLength
        ) {
          errors.push(
            `MsgApp body too long (${request.msgApp.content.body.length}). Max: ${this.msgAppMaxBodyLength} characters`,
          )
        }
      }
    }

    return errors
  }

  /**
   * Cancels or reschedules a notification.
   *
   * Cancellation is allowed for notifications in pending, accepted, or scheduled status.
   * The status is changed to 'cancelled' and the audit fields are updated.
   *
   * Rescheduling updates the delayedSendTime field for notifications in pending, accepted,
   * or scheduled status. The scheduledTime must be in the future.
   *
   * @param notificationId UUID of the notification to cancel or reschedule
   * @param tenantId UUID of the tenant that owns the notification
   * @param updatedBy User ID making the change (for audit trail)
   * @param action Action to perform ('cancel') - optional, if not present then scheduledTime must be provided
   * @param scheduledTime New scheduled time (ISO8601 format) - optional, if not present then action must be 'cancel'
   * @returns Updated NotificationRequest entity
   * @throws NotFoundException if notification not found
   * @throws BadRequestException if notification status doesn't allow modification or scheduledTime is invalid
   */
  async cancelOrRescheduleNotification(
    notificationId: string,
    tenantId: string,
    updatedBy: string,
    action?: 'cancel',
    scheduledTime?: string,
  ): Promise<NotificationRequest> {
    // Fetch the notification
    const notification = await this.findOne(notificationId, tenantId)

    // Only allow cancellation/rescheduling for notifications in these statuses
    const allowedStatuses = ['pending', 'accepted', 'scheduled']
    if (!allowedStatuses.includes(notification.status)) {
      throw new Error(
        `Cannot modify notification with status '${notification.status}'. Allowed statuses: ${allowedStatuses.join(', ')}`,
      )
    }

    // Perform action
    if (action === 'cancel') {
      // Update status to cancelled
      await this.notificationRepository.update(
        { id: notificationId, tenantId },
        {
          status: 'cancelled',
          updatedBy,
          // updatedAt is automatically set by @UpdateDateColumn
        },
      )
      this.logger.log(`Cancelled notification request: ${notificationId}`, { tenantId })
    } else if (scheduledTime) {
      // Validate and reschedule
      const newScheduledTime = new Date(scheduledTime)
      if (isNaN(newScheduledTime.getTime())) {
        throw new Error(`Invalid scheduledTime format: '${scheduledTime}'`)
      }

      if (newScheduledTime <= new Date()) {
        throw new Error(`scheduledTime must be in the future`)
      }

      await this.notificationRepository.update(
        { id: notificationId, tenantId },
        {
          delayedSendTime: newScheduledTime,
          updatedBy,
          // updatedAt is automatically set by @UpdateDateColumn
        },
      )
      this.logger.log(`Rescheduled notification request: ${notificationId}`, {
        tenantId,
        newScheduledTime,
      })
    } else {
      throw new Error(`Either 'action' or 'scheduledTime' must be provided`)
    }

    // Fetch and return updated record
    const updated = await this.findOne(notificationId, tenantId)

    // Publish updated record to Redis so all pods can push updated entry to connected SSE clients
    await this.notificationPubSubService.publish(updated.tenantId, this.mapToDto(updated))

    return updated
  }
}

/** Keys that would reach Object.prototype if written blindly into a nested object. */
const UNSAFE_PARAM_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Write one mail-merge cell into the params object, expanding a dotted column name into the nested
 * shape the renderer expects.
 *
 * A column called `alert.id` has to become `{ alert: { id: value } }`: Handlebars reads `{{alert.id}}`
 * as a path, so a literal `"alert.id"` key would never bind and the placeholder would render empty.
 * It also satisfies the personalisation check, which looks for the root key `alert`.
 *
 * A segment that collides with a non-object value already written (`a` and `a.b` both present) keeps
 * the first value rather than replacing it with an object - the file is contradictory either way,
 * and validation reports it before this runs.
 */
function setMergeParam(params: Record<string, unknown>, key: string, value: string): void {
  const segments = key.split('.')

  if (segments.some((segment) => !segment || UNSAFE_PARAM_SEGMENTS.has(segment))) {
    return
  }

  let target = params
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]
    const existing = target[segment]

    if (existing === undefined) {
      target[segment] = {}
    } else if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
      return
    }

    target = target[segment] as Record<string, unknown>
  }

  const leaf = segments[segments.length - 1]
  if (!(leaf in target)) {
    target[leaf] = value
  }
}
