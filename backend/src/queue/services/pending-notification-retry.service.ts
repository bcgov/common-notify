import { Injectable, Logger, Inject, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import Bull from 'bull'
import { NotificationRequest } from '../../api/notification/entities/notification-request.entity'
import { NotificationService } from '../../api/notification/notification.service'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { QueueName } from '../../enum/queue-name.enum'

/**
 * Pending Notification Retry Service
 *
 * Periodically retries PENDING notifications that couldn't be queued.
 * This handles the case where Redis was temporarily unavailable when the
 * notification was received.
 *
 * Flow:
 * 1. Find all notifications with status PENDING
 * 2. Try to add each one to the queue
 * 3. Update to QUEUED if successful
 * 4. Leave as PENDING if Redis still unavailable (will retry next interval)
 *
 * Schedule: Every 30 seconds (configurable via PENDING_RETRY_INTERVAL env var)
 */
@Injectable()
export class PendingNotificationRetryService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PendingNotificationRetryService.name)
  private retryInterval: NodeJS.Timeout | null = null

  constructor(
    @InjectRepository(NotificationRequest)
    private readonly notificationRepository: Repository<NotificationRequest>,
    private readonly notificationService: NotificationService,
    @Inject(QueueName.INGESTION) private readonly ingestionQueue: Bull.Queue,
  ) {}

  /**
   * Retry pending notifications on a fixed schedule (every 30 seconds)
   * Started automatically when application boots
   */
  async retryPendingNotifications(): Promise<void> {
    this.logger.debug('Running pending notification retry job...')

    try {
      // Find all notifications still in PENDING status
      const pendingNotifications = await this.notificationRepository.find({
        where: { status: NotificationStatus.PENDING },
      })

      if (pendingNotifications.length === 0) {
        this.logger.debug('No pending notifications to retry')
        return
      }

      this.logger.log(
        `Found ${pendingNotifications.length} pending notifications, attempting to queue...`,
      )

      let successCount = 0
      let failureCount = 0

      for (const notification of pendingNotifications) {
        try {
          this.logger.debug(`Processing pending notification: ${notification.id}`, {
            payload: notification.payload,
            hasQueue: !!this.ingestionQueue,
            queueName: this.ingestionQueue?.name,
          })

          // Try to add to queue with stored payload
          await this.ingestionQueue.add(
            'process',
            {
              notifyId: notification.id,
              tenantId: notification.tenantId,
              request: notification.payload || {}, // Use stored payload
              requestedAt: notification.createdAt.toISOString(),
            },
            {
              jobId: notification.id,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 2000,
              },
              removeOnComplete: false,
              removeOnFail: false,
            },
          )

          // Update status to QUEUED
          await this.notificationService.update(notification.id, notification.tenantId, {
            status: NotificationStatus.QUEUED,
            updatedBy: 'retry-scheduler',
          })

          successCount++
          this.logger.log(`Successfully queued retry: ${notification.id}`)
        } catch (error) {
          failureCount++
          this.logger.warn(
            `Failed to queue retry for notification ${notification.id}: ${(error as Error).message}`,
            { errorStack: (error as Error).stack },
          )
          // Don't throw - continue with next notification
        }
      }

      this.logger.log(
        `Pending notification retry completed: ${successCount} succeeded, ${failureCount} failed`,
      )
    } catch (error) {
      this.logger.error(
        `Error in pending notification retry job: ${(error as Error).message}`,
        (error as Error).stack,
      )
      // Don't throw - scheduler should continue running
    }
  }

  /**
   * Start the retry interval when application boots
   * Runs retryPendingNotifications every 30 seconds
   */
  onApplicationBootstrap(): void {
    const retryIntervalMs = parseInt(process.env.PENDING_RETRY_INTERVAL || '30000', 10)
    this.logger.log(`Starting pending notification retry job (interval: ${retryIntervalMs}ms)`)

    // Run immediately on startup
    this.retryPendingNotifications().catch((error) => {
      this.logger.error(`Initial retry job failed: ${(error as Error).message}`)
    })

    // Then run on interval
    this.retryInterval = setInterval(() => {
      this.retryPendingNotifications().catch((error) => {
        this.logger.error(`Scheduled retry job failed: ${(error as Error).message}`)
      })
    }, retryIntervalMs)
  }

  /**
   * Clean up the interval when application shuts down (optional onModuleDestroy)
   */
  onModuleDestroy(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval)
      this.logger.log('Pending notification retry job stopped')
    }
  }
}
