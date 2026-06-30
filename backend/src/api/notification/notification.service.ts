import { Injectable, Logger, NotFoundException } from '@nestjs/common'
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
import { BULK_EMAIL_MAX_REPORTED_ERRORS } from '../notify/schemas/bulk-email.constants'
import { TenantsService } from '../admin/tenants/tenants.service'
import { NotificationPubSubService } from './notification-pubsub.service'
import { TemplatesRepository } from '../templates/templates.repository'
import { ListQueryDto } from '../../common/query/list-query.dto'
import { parseListQuery } from '../../common/query/list-query.parser'
import { applyParsedListQueryToQueryBuilder } from '../../common/query/typeorm-list-query.util'
import type { QueryableFieldsConfig } from '../../common/query/list-query.types'

const notificationListQueryConfig: QueryableFieldsConfig = {
  sortableFields: {
    createdAt: 'notification.createdAt',
    updatedAt: 'notification.updatedAt',
    status: 'notification.status',
    channelCode: 'notification.channelCode',
  },
  filterableFields: {
    status: {
      column: 'notification.status',
      valueType: 'string',
      operators: ['eq', 'ne', 'in'],
    },
    channelCode: {
      column: 'notification.channelCode',
      valueType: 'string',
      operators: ['eq', 'in', 'isnull'],
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

  constructor(
    @InjectRepository(NotificationRequest)
    private readonly notificationRepository: Repository<NotificationRequest>,
    private readonly tenantsService: TenantsService,
    private readonly configService: ConfigService,
    private readonly templatesRepository: TemplatesRepository,
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
  private mapToDto(entity: NotificationRequest): NotificationRequestDto {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      status: entity.status,
      channelCode: entity.channelCode,
      channel: entity.channel
        ? {
            channelCode: entity.channel.channelCode,
            displayName: entity.channel.displayName,
            description: entity.channel.description,
          }
        : undefined,
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
   * Extract channel code, recipients, and delayed send time from a bulk email payload. Bulk sends
   * are always a single EMAIL-channel request, with recipient addresses parsed from `mergeArray`
   * (mirroring how simple sends store their recipients on the parent request).
   */
  private extractBulkChannelAndRecipients(payload: NotifySimpleRequest): {
    channel: string | null
    recipients: { email?: string[]; sms?: string[]; msgApp?: string[] } | null
    delayedSendTime: Date | null
  } {
    const email = payload.email
    const delayedSendTime = email?.delayedSend ? new Date(email.delayedSend) : null
    const parsed = this.parseBulkRecipients(email?.recipients?.mergeArray ?? [])
    const addresses = parsed.map((r) => r.address)
    return {
      channel: 'EMAIL',
      recipients: addresses.length > 0 ? { email: addresses } : null,
      delayedSendTime:
        delayedSendTime && !isNaN(delayedSendTime.getTime()) ? delayedSendTime : null,
    }
  }

  private extractChannelAndRecipients(
    payload: NotifySimpleRequest | ProcessedNotifySimpleRequest | undefined,
  ): {
    channel: string | null
    recipients: { email?: string[]; sms?: string[]; msgApp?: string[] } | null
    delayedSendTime: Date | null
  } {
    if (!payload) {
      return { channel: null, recipients: null, delayedSendTime: null }
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

    // Determine primary channel code
    let channelCode: string | null = null
    if (channels.length === 1) {
      channelCode = channels[0]
    } else if (channels.length > 1) {
      channelCode = 'MULTIPLE'
    }

    return {
      channel: channelCode,
      recipients: Object.keys(recipients).length > 0 ? recipients : null,
      delayedSendTime:
        delayedSendTime && !isNaN(delayedSendTime.getTime()) ? delayedSendTime : null,
    }
  }

  async create(dto: CreateNotificationRequestDto): Promise<NotificationRequest> {
    // Extract channel, recipients, and delayed send time from payload. Mail-merge sends (email
    // recipients given as `mergeArray`) take a dedicated extractor since the addressees live in the
    // merge rows rather than to/cc/bcc.
    const { channel, recipients, delayedSendTime } = Array.isArray(
      dto.payload?.email?.recipients?.mergeArray,
    )
      ? this.extractBulkChannelAndRecipients(dto.payload as NotifySimpleRequest)
      : this.extractChannelAndRecipients(dto.payload)

    const notification = this.notificationRepository.create({
      tenantId: dto.tenantId,
      status: dto.status ?? NotificationStatus.QUEUED,
      createdBy: dto.createdBy,
      payload: dto.payload,
      channelCode: channel,
      recipients: recipients,
      delayedSendTime: delayedSendTime,
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
   * Validate a bulk email request's business rules: the template must exist for the tenant and
   * every row's email address must be well-formed. Returns a bounded list of error strings
   * (empty when valid), mirroring validateBusinessRules so the caller can throw a 422.
   */
  async validateEmailMergeRules(tenantId: string, dto: NotifySimpleRequest): Promise<string[]> {
    const errors: string[] = []

    const email = dto.email
    const mergeArray = email?.recipients?.mergeArray ?? []
    const templateId = email?.templateId
    const hasInlineContent = !!(email?.content && (email.content.subject || email.content.body))

    const tenant = await this.tenantsService.findOne(tenantId)
    if (!tenant) {
      errors.push(`Tenant '${tenantId}' not found`)
      return errors
    }
    if (tenant.status !== 'active') {
      errors.push(`Tenant is not active (status: ${tenant.status})`)
    }

    // A merge renders from either a server template or inline content.
    if (templateId) {
      const template = await this.templatesRepository.findById(tenantId, templateId)
      if (!template) {
        errors.push(`Template '${templateId}' not found for tenant '${tenantId}'`)
      } else if (template.channelCode !== 'EMAIL') {
        errors.push(`Template '${templateId}' is not an EMAIL template`)
      }
    } else if (!hasInlineContent) {
      errors.push('Request must provide either a templateId or inline content (subject/body)')
    }

    if (email?.delayedSend) {
      const scheduledTime = new Date(email.delayedSend).getTime()
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
      if (errors.length >= BULK_EMAIL_MAX_REPORTED_ERRORS) {
        errors.push(
          `Additional invalid rows omitted (showing first ${BULK_EMAIL_MAX_REPORTED_ERRORS})`,
        )
        break
      }
      const address = (mergeArray[i]?.[0] ?? '').trim()
      if (!address) {
        errors.push(`Row ${i}: email address is missing`)
      } else if (!isEmail(address)) {
        errors.push(`Row ${i}: "${address}" is not a valid email address`)
      } else {
        const normalised = address.toLowerCase()
        const firstSeen = seen.get(normalised)
        if (firstSeen !== undefined) {
          errors.push(`Row ${i}: "${address}" is a duplicate of row ${firstSeen}`)
        } else {
          seen.set(normalised, i)
        }
      }
    }

    return errors
  }

  /**
   * Parse the mergeArray into per-recipient data. Returns one entry per data row containing
   * the recipient address (from the "to" column) and any extra columns as template params.
   * Per-recipient params take precedence over global params when rendering.
   */
  parseBulkRecipients(
    mergeArray: string[][],
  ): Array<{ address: string; params: Record<string, unknown> }> {
    const header = mergeArray[0] ?? []
    return mergeArray.slice(1).map((row) => {
      const address = (row[0] ?? '').trim()
      const params: Record<string, unknown> = {}
      for (let i = 1; i < header.length; i++) {
        const key = (header[i] ?? '').trim()
        if (key) params[key] = row[i] ?? ''
      }
      return { address, params }
    })
  }

  async findAll(
    tenantExternalId: string,
    query: ListQueryDto,
  ): Promise<PaginatedNotificationResponse> {
    const parsedQuery = parseListQuery(query, notificationListQueryConfig)

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
      .where('notification.tenantId = :tenantId', { tenantId: tenant.id })

    applyParsedListQueryToQueryBuilder(queryBuilder, parsedQuery, notificationListQueryConfig)
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

    // Validate template if templateId is provided
    if (request.templateId) {
      try {
        const template = await this.templatesRepository.findById(tenantId, request.templateId)
        if (!template) {
          errors.push(
            `Template '${request.templateId}' not found for tenant '${tenantId}'. Please verify the template ID is correct.`,
          )
        } else {
          // Verify template has required channel codes for requested channels
          const requestedChannels = []
          if (request.email?.recipients) requestedChannels.push('EMAIL')
          if (request.sms?.recipients) requestedChannels.push('SMS')
          if (request.msgApp?.recipients) requestedChannels.push('MSGAPP')

          const templateChannelCode = template.channelCode

          for (const channel of requestedChannels) {
            if (templateChannelCode !== channel) {
              errors.push(
                `Template '${request.templateId}' has channel code '${templateChannelCode}' but requested channel is '${channel}'.`,
              )
            }
          }
        }
      } catch (error) {
        errors.push(
          `Failed to validate template: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

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
      if (!request.templateId) {
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
      if (!request.templateId) {
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
      if (!request.templateId) {
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
