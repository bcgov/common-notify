import { Injectable, Logger, NotFoundException } from '@nestjs/common'
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

  constructor(
    @InjectRepository(NotificationRequest)
    private readonly notificationRepository: Repository<NotificationRequest>,
    private readonly tenantsService: TenantsService,
  ) {}

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

  async findAll(tenantId: string): Promise<NotificationRequest[]> {
    return this.notificationRepository.find({ where: { tenantId }, order: { createdAt: 'DESC' } })
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

  async remove(id: string, tenantId: string): Promise<void> {
    const notification = await this.findOne(id, tenantId)
    await this.notificationRepository.remove(notification)
    this.logger.debug(`Deleted notification request: ${id}`)
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
   * - No obvious spam patterns
   *
   * Future validations (not implemented yet):
   * - Template exists (if templateId provided)
   * - Rate limits not exceeded
   * - Recipients not on blocklist
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
    const emailRecipients = request.email?.to?.length ?? 0
    const smsRecipients = request.sms?.to?.length ?? 0
    const msgAppRecipients = request.msgApp?.to?.length ?? 0
    const totalRecipients = emailRecipients + smsRecipients + msgAppRecipients

    if (totalRecipients === 0) {
      errors.push('At least one recipient is required (email, SMS, or msgApp)')
    }

    // Validate email channel
    if (request.email?.to) {
      if (request.email.to.length > 100) {
        errors.push(`Too many email recipients (${request.email.to.length}). Max: 100`)
      }

      if (!request.email.subject?.trim()) {
        errors.push('Email subject cannot be empty')
      }

      if (request.email.subject && request.email.subject.length > 500) {
        errors.push(`Email subject too long (${request.email.subject.length}). Max: 500`)
      }

      if (!request.email.body?.trim()) {
        errors.push('Email body cannot be empty')
      }

      if (request.email.body && request.email.body.length > 50000) {
        errors.push(`Email body too long (${request.email.body.length}). Max: 50000 characters`)
      }
    }

    // Validate SMS channel
    if (request.sms?.to) {
      if (request.sms.to.length > 50) {
        errors.push(`Too many SMS recipients (${request.sms.to.length}). Max: 50`)
      }

      if (!request.sms.body?.trim()) {
        errors.push('SMS body cannot be empty')
      }

      if (request.sms.body && request.sms.body.length > 1600) {
        // SMS can be split across multiple messages, but warn if very long
        errors.push(`SMS body too long (${request.sms.body.length}). Max: 1600 characters`)
      }
    }

    // Validate msgApp channel
    if (request.msgApp?.to) {
      if (request.msgApp.to.length > 100) {
        errors.push(`Too many msgApp recipients (${request.msgApp.to.length}). Max: 100`)
      }

      if (!request.msgApp.body?.trim()) {
        errors.push('MsgApp body cannot be empty')
      }

      if (request.msgApp.body && request.msgApp.body.length > 50000) {
        errors.push(`MsgApp body too long (${request.msgApp.body.length}). Max: 50000 characters`)
      }
    }

    // Check for common spam patterns
    if (this.looksLikeSpam(request)) {
      errors.push('Request matches spam detection patterns')
    }

    return errors
  }

  /**
   * Simple spam detection heuristics - can be extended
   * Returns true if request appears to be spam
   */
  private looksLikeSpam(request: NotifySimpleRequest): boolean {
    // Check email for spam patterns
    if (request.email?.body) {
      const body = request.email.body

      // All CAPS + long = likely spam
      if (body.toUpperCase() === body && body.length > 100) {
        return true
      }

      // Excessive links (more than 20)
      const linkCount = (body.match(/https?:\/\//g) || []).length
      if (linkCount > 20) {
        return true
      }

      // Excessive exclamation marks (more than 10% of text)
      const exclamationCount = (body.match(/!/g) || []).length
      if (exclamationCount > body.length * 0.1) {
        return true
      }
    }

    return false
  }
}
