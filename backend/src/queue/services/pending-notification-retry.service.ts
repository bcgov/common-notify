import { Injectable, Logger, Inject, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import Bull from 'bull'
import { NotificationRequest } from '../../api/notification/entities/notification-request.entity'
import { NotificationService } from '../../api/notification/notification.service'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { QueueName } from '../../enum/queue-name.enum'
import { redisKey } from '../../common/redis/redis-namespace'
import { COMPLETED_JOB_RETENTION, FAILED_JOB_RETENTION } from '../job-retention'

/**
 * Redis key held by whichever pod is currently sweeping. Namespaced per deployment: the Redis
 * instance is shared, and one deployment must not hold a lock that stops another sweeping its
 * own database.
 */
const SWEEP_LOCK_KEY = redisKey('pending-retry:lock')

/**
 * Release only our own lock. A sweep that overran its TTL must not delete the lock a
 * different pod has since taken, or two pods would sweep at once.
 */
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`

/**
 * Pending Notification Retry Service
 *
 * Periodically retries PENDING notifications that couldn't be queued.
 * This handles the case where Redis was temporarily unavailable when the
 * notification was received.
 *
 * Flow:
 * 1. Take the sweep lock, so only one pod sweeps at a time
 * 2. Find a batch of notifications with status PENDING, oldest first
 * 3. Try to add each one to the queue
 * 4. Update to QUEUED if successful
 * 5. Leave as PENDING if Redis still unavailable (will retry next interval)
 *
 * Schedule: Every 30 seconds (configurable via PENDING_RETRY_INTERVAL env var)
 *
 * The lock matters because every pod runs this timer: without it, three to seven replicas
 * each pull the same PENDING rows every 30 seconds and race to queue them. Bull's jobId
 * deduplication hides the duplicate sends, but the wasted work is real and it is at its worst
 * during the backlog this job exists to drain. The batch limit bounds that further - a
 * backlog is drained over several passes rather than loaded into memory in one.
 */
@Injectable()
export class PendingNotificationRetryService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PendingNotificationRetryService.name)
  private retryInterval: NodeJS.Timeout | null = null
  /** Identifies this pod's hold on the lock, so it only ever releases its own. */
  private readonly instanceId = randomUUID()

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

    const lockTtlMs = parseInt(process.env.PENDING_RETRY_LOCK_TTL || '60000', 10)
    if (!(await this.acquireSweepLock(lockTtlMs))) {
      this.logger.debug('Another pod holds the pending notification sweep lock, skipping')
      return
    }

    try {
      await this.sweep()
    } finally {
      await this.releaseSweepLock()
    }
  }

  private async sweep(): Promise<void> {
    try {
      const batchSize = parseInt(process.env.PENDING_RETRY_BATCH_SIZE || '100', 10)

      // Oldest first, so a backlog drains in arrival order across passes rather than the
      // same head of the table being re-read while later rows starve.
      const pendingNotifications = await this.notificationRepository.find({
        where: { status: NotificationStatus.PENDING },
        order: { createdAt: 'ASC' },
        take: batchSize,
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
              removeOnComplete: COMPLETED_JOB_RETENTION,
              removeOnFail: FAILED_JOB_RETENTION,
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
   * Claim the sweep for this pod. The TTL is a crash guard: the lock is released in a finally
   * block on the happy path, and expires on its own if the holder dies mid-sweep.
   *
   * A Redis failure here means no sweep this pass, which is the right answer - queueing is
   * what the sweep does, and that needs the same Redis.
   */
  private async acquireSweepLock(ttlMs: number): Promise<boolean> {
    try {
      const result = await this.ingestionQueue.client.set(
        SWEEP_LOCK_KEY,
        this.instanceId,
        'PX',
        ttlMs,
        'NX',
      )
      return result === 'OK'
    } catch (error) {
      this.logger.warn(
        `Could not reach Redis to take the sweep lock, skipping this pass: ${(error as Error).message}`,
      )
      return false
    }
  }

  private async releaseSweepLock(): Promise<void> {
    try {
      await this.ingestionQueue.client.eval(RELEASE_LOCK_SCRIPT, 1, SWEEP_LOCK_KEY, this.instanceId)
    } catch (error) {
      // The lock expires on its own, so a failed release costs at most one skipped pass.
      this.logger.warn(`Failed to release the sweep lock: ${(error as Error).message}`)
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
