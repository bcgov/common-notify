import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { NotificationDelivery } from './entities/notification-delivery.entity'

@Injectable()
export class NotificationDeliveryService {
  constructor(
    @InjectRepository(NotificationDelivery)
    private readonly deliveryRepository: Repository<NotificationDelivery>,
  ) {}

  /**
   * Create pending delivery records (one per recipient) at the start of a first attempt.
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
      this.deliveryRepository.create({
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
    await this.deliveryRepository.save(entities)
  }

  /**
   * Mark all delivery records for a request as completed.
   */
  async markCompleted(notificationRequestId: string): Promise<void> {
    await this.deliveryRepository.update(
      { notificationRequestId },
      { status: 'completed', lastAttemptAt: new Date(), updatedBy: 'system' },
    )
  }

  /**
   * Mark all delivery records for a request as failed. Only called on the final attempt.
   */
  async markFailed(notificationRequestId: string, errorMessage: string): Promise<void> {
    await this.deliveryRepository.update(
      { notificationRequestId },
      { status: 'failed', errorMessage, lastAttemptAt: new Date(), updatedBy: 'system' },
    )
  }

  /**
   * Increment attempt_count and reset status to pending before a retry attempt.
   */
  async resetForRetry(notificationRequestId: string): Promise<void> {
    await this.deliveryRepository.increment({ notificationRequestId }, 'attemptCount', 1)
    await this.deliveryRepository.update(
      { notificationRequestId },
      { status: 'pending', lastAttemptAt: new Date(), updatedBy: 'system' },
    )
  }

  /**
   * Retrieve all delivery records for a notification request, ordered by creation time.
   */
  async findByRequestId(notificationRequestId: string): Promise<NotificationDelivery[]> {
    return this.deliveryRepository.find({
      where: { notificationRequestId },
      order: { createdAt: 'ASC' },
    })
  }

  /**
   * DEBUG: Retrieve all delivery records across all requests, newest first.
   * Remove when per-request filtering is confirmed working.
   */
  async findAllDebug(): Promise<NotificationDelivery[]> {
    return this.deliveryRepository.find({ order: { createdAt: 'DESC' } })
  }
}
