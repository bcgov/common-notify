import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { NotificationRequest } from './entities/notification-request.entity'
import {
  CreateNotificationRequestDto,
  NotificationStatus,
  UpdateNotificationRequestDto,
} from './schemas'
import { NotifySimpleRequest } from '../api/notify/schemas/notify-simple-request'
import { TenantsService } from '../admin/tenants/tenants.service'

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

  async create(dto: CreateNotificationRequestDto): Promise<NotificationRequest> {
    const notification = this.notificationRepository.create({
      tenantId: dto.tenantId,
      status: dto.status ?? NotificationStatus.QUEUED,
      createdBy: dto.createdBy,
      payload: dto.payload,
    })
    const saved = await this.notificationRepository.save(notification)
    this.logger.debug(`Created notification request: ${saved.id}`)
    return saved
  }

  async findAll(): Promise<NotificationRequest[]> {
    return this.notificationRepository.find({ order: { createdAt: 'DESC' } })
  }

  async findOne(id: string, tenantId: string): Promise<NotificationRequest> {
    const notification = await this.notificationRepository.findOne({ where: { id, tenantId } })
    if (!notification) {
      throw new NotFoundException(`Notification request with id '${id}' not found`)
    }
    return notification
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

    // Use query builder for explicit update (status field is part of FK constraint so TypeORM won't track it normally)
    await this.notificationRepository.update({ id, tenantId }, updateData)

    // Fetch and return updated record
    const updated = await this.findOne(id, tenantId)
    this.logger.log(`Updated notification request: ${id}`, { status: dto.status })
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
  async validateBusinessRules(tenantId: string, request: NotifySimpleRequest): Promise<string[]> {
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

    // Ensure at least one channel has recipients
    const emailRecipients = request.email?.recipients?.length ?? 0
    const smsRecipients = request.sms?.recipients?.length ?? 0
    const msgAppRecipients = request.msgApp?.recipients?.length ?? 0
    const totalRecipients = emailRecipients + smsRecipients + msgAppRecipients

    if (totalRecipients === 0) {
      errors.push('At least one recipient is required (email, SMS, or msgApp)')
    }

    // Validate email channel
    if (request.email?.recipients) {
      if (request.email.recipients.length > this.emailMaxRecipients) {
        errors.push(
          `Too many email recipients (${request.email.recipients.length}). Max: ${this.emailMaxRecipients}`,
        )
      }

      if (!request.email.subject?.trim()) {
        errors.push('Email subject cannot be empty')
      }

      if (request.email.subject && request.email.subject.length > this.emailMaxSubjectLength) {
        errors.push(
          `Email subject too long (${request.email.subject.length}). Max: ${this.emailMaxSubjectLength}`,
        )
      }

      if (!request.email.body?.trim()) {
        errors.push('Email body cannot be empty')
      }

      if (request.email.body && request.email.body.length > this.emailMaxBodyLength) {
        errors.push(
          `Email body too long (${request.email.body.length}). Max: ${this.emailMaxBodyLength} characters`,
        )
      }
    }

    // Validate SMS channel
    if (request.sms?.recipients) {
      if (request.sms.recipients.length > this.smsMaxRecipients) {
        errors.push(
          `Too many SMS recipients (${request.sms.recipients.length}). Max: ${this.smsMaxRecipients}`,
        )
      }

      if (!request.sms.body?.trim()) {
        errors.push('SMS body cannot be empty')
      }

      if (request.sms.body && request.sms.body.length > this.smsMaxBodyLength) {
        // SMS can be split across multiple messages, but warn if very long
        errors.push(
          `SMS body too long (${request.sms.body.length}). Max: ${this.smsMaxBodyLength} characters`,
        )
      }
    }

    // Validate msgApp channel
    if (request.msgApp?.recipients) {
      if (request.msgApp.recipients.length > this.msgAppMaxRecipients) {
        errors.push(
          `Too many msgApp recipients (${request.msgApp.recipients.length}). Max: ${this.msgAppMaxRecipients}`,
        )
      }

      if (!request.msgApp.body?.trim()) {
        errors.push('MsgApp body cannot be empty')
      }

      if (request.msgApp.body && request.msgApp.body.length > this.msgAppMaxBodyLength) {
        errors.push(
          `MsgApp body too long (${request.msgApp.body.length}). Max: ${this.msgAppMaxBodyLength} characters`,
        )
      }
    }

    return errors
  }
}
