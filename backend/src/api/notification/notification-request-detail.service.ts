import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { NotificationRequestDetail } from './entities/notification-request-detail.entity'
import { ProcessedNotifySimpleRequest } from '../notify/schemas/stored-notify-attachment'
import { NotifySimpleRequest } from '../notify/schemas/notify-simple-request'

@Injectable()
export class NotificationRequestDetailService {
  constructor(
    @InjectRepository(NotificationRequestDetail)
    private readonly detailRepository: Repository<NotificationRequestDetail>,
  ) {}

  /**
   * Create pending request detail records (one per recipient) before reaching the ingestion queue.
   */
  async createPending(
    notificationRequestId: string,
    payload: NotifySimpleRequest | ProcessedNotifySimpleRequest | undefined,
    createdBy?: string,
  ): Promise<void> {
    const { recipients } = this.extractRecipients(payload)
    if (
      recipients.email.length === 0 &&
      recipients.sms.length === 0 &&
      recipients.msgApp.length === 0
    )
      return
    const now = new Date()
    const makeEntity = (
      address: string,
      channel: string,
      emailAddressType?: 'primary' | 'cc' | 'bcc',
    ) =>
      this.detailRepository.create({
        notificationRequestId,
        recipientAddress: address,
        channel,
        emailAddressType,
        status: 'pending',
        attemptCount: 1,
        lastAttemptAt: now,
        createdBy,
        updatedBy: createdBy,
      })
    const entities = [
      ...recipients.email.map(({ address, emailAddressType }) =>
        makeEntity(address, 'EMAIL', emailAddressType),
      ),
      ...recipients.sms.map((address) => makeEntity(address, 'SMS')),
      ...recipients.msgApp.map((address) => makeEntity(address, 'MSGAPP')),
    ]
    await this.detailRepository.save(entities)
  }

  /**
   * Mark all request detail records for a request as sent.
   */
  async markSent(notificationRequestId: string, providerResponseId?: string): Promise<void> {
    await this.detailRepository.update(
      { notificationRequestId },
      {
        status: 'sent',
        lastAttemptAt: new Date(),
        updatedBy: 'system',
        ...(providerResponseId && { providerResponseId }),
      },
    )
  }

  // TODO - add route to update individual notification request detail as sent
  // need more info on what the smtp gateway returns on individual failure

  /**
   * Mark all request detail records for a request as failed. Only called on the final attempt.
   */
  async markFailed(notificationRequestId: string, errorMessage: string): Promise<void> {
    await this.detailRepository.update(
      { notificationRequestId },
      { status: 'failed', errorMessage, lastAttemptAt: new Date(), updatedBy: 'system' },
    )
  }

  // TODO - add route to update individual notification request detail as failed
  // need more info on what the smtp gateway returns on individual failure

  /**
   * Update the status of all detail records for a notification request.
   */
  async updateStatus(notificationRequestId: string, status: string): Promise<void> {
    await this.detailRepository.update(
      { notificationRequestId },
      { status, updatedBy: 'system' },
    )
  }

  /**
   * Increment attempt_count and reset status to pending before a retry attempt.
   */
  async resetForRetry(notificationRequestId: string): Promise<void> {
    await this.detailRepository.increment({ notificationRequestId }, 'attemptCount', 1)
    await this.detailRepository.update(
      { notificationRequestId },
      { status: 'pending', lastAttemptAt: new Date(), updatedBy: 'system' },
    )
  }

  /**
   * Retrieve all request detail records for a notification request belonging to a tenant.
   */
  async findByRequestId(
    notificationRequestId: string,
    tenantId: string,
  ): Promise<NotificationRequestDetail[]> {
    return this.detailRepository.find({
      where: { notificationRequestId, notificationRequest: { tenantId } },
      relations: { notificationRequest: true },
      order: { createdAt: 'DESC' },
    })
  }

  /**
   * Retrieve all request detail records for a tenant, newest first.
   */
  async findAllByTenantId(tenantId: string): Promise<NotificationRequestDetail[]> {
    return this.detailRepository.find({
      where: { notificationRequest: { tenantId } },
      relations: { notificationRequest: true },
      order: { createdAt: 'DESC' },
    })
  }

  /**
   * Extract channel code, recipients, and delayed send time from notification payload
   */
  private extractRecipients(
    payload: NotifySimpleRequest | ProcessedNotifySimpleRequest | undefined,
  ): {
    recipients: {
      email: { address: string; emailAddressType: 'primary' | 'cc' | 'bcc' }[]
      sms: string[]
      msgApp: string[]
    }
  } {
    if (!payload) {
      return { recipients: { email: [], sms: [], msgApp: [] } }
    }

    const recipients = {
      email: [] as { address: string; emailAddressType: 'primary' | 'cc' | 'bcc' }[],
      sms: [] as string[],
      msgApp: [] as string[],
    }

    if (payload.email) {
      recipients.email = [
        ...(payload.email.recipients?.to || []).map((address) => ({
          address,
          emailAddressType: 'primary' as const,
        })),
        ...(payload.email.recipients?.cc || []).map((address) => ({
          address,
          emailAddressType: 'cc' as const,
        })),
        ...(payload.email.recipients?.bcc || []).map((address) => ({
          address,
          emailAddressType: 'bcc' as const,
        })),
      ]
    }

    if (payload.sms) {
      recipients.sms = payload.sms.recipients?.to || []
    }

    if (payload.msgApp) {
      recipients.msgApp = payload.msgApp.recipients?.to || []
    }

    return {
      recipients,
    }
  }
}
