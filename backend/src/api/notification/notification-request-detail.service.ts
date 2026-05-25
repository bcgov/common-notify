import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { NotificationRequestDetail } from './entities/notification-request-detail.entity'

@Injectable()
export class NotificationRequestDetailService {
  constructor(
    @InjectRepository(NotificationRequestDetail)
    private readonly detailRepository: Repository<NotificationRequestDetail>,
  ) {}

  /**
   * Create pending request detail records (one per recipient) at the start of a first attempt.
   */
  async createPending(
    notificationRequestId: string,
    recipients: string[],
    channel: string,
    createdBy?: string,
  ): Promise<void> {
    if (recipients.length === 0) return
    const now = new Date()
    const entities = recipients.map((address) =>
      this.detailRepository.create({
        notificationRequestId,
        recipientAddress: address,
        channel,
        status: 'pending',
        attemptCount: 1,
        lastAttemptAt: now,
        createdBy,
        updatedBy: createdBy,
      }),
    )
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
   * Retrieve all request detail records for a notification request, ordered by creation time.
   */
  async findByRequestId(notificationRequestId: string): Promise<NotificationRequestDetail[]> {
    return this.detailRepository.find({
      where: { notificationRequestId },
      order: { createdAt: 'ASC' },
    })
  }

  /**
   * DEBUG: Retrieve all request detail records across all requests, newest first.
   * Remove later.
   */
  async findAllDebug(): Promise<NotificationRequestDetail[]> {
    return this.detailRepository.find({ order: { createdAt: 'DESC' } })
  }
}
