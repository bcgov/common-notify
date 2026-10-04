import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { randomUUID } from 'crypto'
import type Bull from 'bull'
import type Redis from 'ioredis'
import { NotificationRequestDetail } from '../../api/notification/entities/notification-request-detail.entity'
import { NotificationRequest } from '../../api/notification/entities/notification-request.entity'
import { NotificationService } from '../../api/notification/notification.service'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { ProviderToken } from '../../enum/provider-token.enum'
import { QueueName } from '../../enum/queue-name.enum'
import { redisKey } from '../../common/redis/redis-namespace'
import { FAILED_JOB_RETENTION } from '../job-retention'
import { mergeContentFromRequest } from '../merge-batch-builder'
import type { DeliveryJobPayload } from '../queue.types'

const intFromEnv = (name: string, fallback: number) => {
  const value = parseInt(process.env[name] || '', 10)
  return Number.isFinite(value) ? value : fallback
}

const RECONCILE_INTERVAL_MS = intFromEnv('BATCH_RECONCILE_INTERVAL_MS', 60_000)
/** How long a recipient may stay in flight before its batch is checked for a live job. */
const STALE_AFTER_MS = intFromEnv('BATCH_RECONCILE_STALE_MS', 10 * 60_000)
/** Recovery attempts per batch before its remaining recipients are marked failed. */
const MAX_RECOVERY_ATTEMPTS = intFromEnv('BATCH_RECONCILE_MAX_ATTEMPTS', 5)
const BATCHES_PER_PASS = 50

const LOCK_KEY = redisKey('batch-reconcile:lock')
const attemptsKey = (batchId: string) => redisKey(`batch-reconcile:attempts:${batchId}`)
const ATTEMPTS_TTL_SECONDS = 7 * 24 * 60 * 60

/** Release only our own lock; see PendingNotificationRetryService for why. */
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`

const IN_FLIGHT_STATUSES = ['pending', 'queued', 'processing', 'sending']
/** Bull states in which the batch's job will still run without help. */
const LIVE_JOB_STATES = new Set(['waiting', 'active', 'delayed', 'paused'])

export type ReconcileOutcome = 'in-progress' | 'retried' | 'requeued' | 'gave-up'

interface StaleBatch {
  batchId: string
  notifyId: string
  tenantId: string
  channel: string
}

/**
 * Finds merge batches whose recipients are still in flight with no job left to send them, and
 * puts them back on the queue.
 *
 * The queue's own recovery covers a worker dying mid-job: Bull notices the lapsed lock and
 * retries. It does not cover a job that ends up failed (out of retries, or stalled more often
 * than maxStalledCount) or one that never reached Redis; its recipients would stay pending
 * forever. Postgres is the record of what is owed, so this compares it with what the queue
 * holds:
 *   - a live job (waiting, active, delayed) is left alone - a long batch is not stuck;
 *   - a failed job is retried with its original payload;
 *   - a missing or finished job is rebuilt from the stored request and queued again.
 * Merge workers skip recipients already sent, so any of these is safe to repeat. After
 * MAX_RECOVERY_ATTEMPTS a batch's remaining recipients are marked failed, so a send that can
 * never succeed (a deleted template, a rejected sender) ends visibly instead of looping.
 *
 * One pod at a time, behind a Redis lock, every RECONCILE_INTERVAL_MS.
 */
@Injectable()
export class BatchReconcilerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BatchReconcilerService.name)
  private readonly instanceId = randomUUID()
  private timer?: NodeJS.Timeout

  constructor(
    @InjectRepository(NotificationRequestDetail)
    private readonly detailRepository: Repository<NotificationRequestDetail>,
    @InjectRepository(NotificationRequest)
    private readonly requestRepository: Repository<NotificationRequest>,
    private readonly notificationService: NotificationService,
    @Optional() @Inject(ProviderToken.REDIS_CLIENT) private readonly redis?: Redis | null,
    @Optional() @Inject(QueueName.EMAIL_DELIVERY) private readonly emailQueue?: Bull.Queue | null,
    @Optional() @Inject(QueueName.SMS_DELIVERY) private readonly smsQueue?: Bull.Queue | null,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.redis || !this.emailQueue) return
    this.timer = setInterval(() => void this.reconcile(), RECONCILE_INTERVAL_MS)
    this.timer.unref()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  /** One pass. Never throws: a failed pass is logged and the next interval tries again. */
  async reconcile(now = Date.now()): Promise<Partial<Record<ReconcileOutcome, number>>> {
    const outcomes: Partial<Record<ReconcileOutcome, number>> = {}
    if (!this.redis) return outcomes

    try {
      const locked = await this.redis.set(
        LOCK_KEY,
        this.instanceId,
        'PX',
        RECONCILE_INTERVAL_MS,
        'NX',
      )
      if (locked !== 'OK') return outcomes
    } catch (error) {
      this.logger.warn(`Could not take the reconcile lock: ${(error as Error).message}`)
      return outcomes
    }

    try {
      for (const batch of await this.findStaleBatches(now)) {
        try {
          const outcome = await this.reconcileBatch(batch)
          outcomes[outcome] = (outcomes[outcome] ?? 0) + 1
        } catch (error) {
          this.logger.error(
            `[${batch.notifyId}] Could not reconcile batch ${batch.batchId}: ${(error as Error).message}`,
          )
        }
      }
      const acted = (outcomes.retried ?? 0) + (outcomes.requeued ?? 0) + (outcomes['gave-up'] ?? 0)
      if (acted > 0) this.logger.warn(`Batch reconcile: ${JSON.stringify(outcomes)}`)
    } catch (error) {
      this.logger.error(`Batch reconcile pass failed: ${(error as Error).message}`)
    } finally {
      await this.redis
        .eval(RELEASE_LOCK_SCRIPT, 1, LOCK_KEY, this.instanceId)
        .catch(() => undefined)
    }
    return outcomes
  }

  /** Merge batches with a recipient in flight longer than STALE_AFTER_MS; scheduled sends excluded. */
  private findStaleBatches(now: number): Promise<StaleBatch[]> {
    return this.detailRepository
      .createQueryBuilder('detail')
      .innerJoin('detail.notificationRequest', 'request')
      .select('detail.batch_id', 'batchId')
      .addSelect('detail.notification_request_id', 'notifyId')
      .addSelect('request.tenant_id', 'tenantId')
      .addSelect('detail.channel', 'channel')
      .where('detail.batch_id IS NOT NULL')
      .andWhere('detail.status IN (:...statuses)', { statuses: IN_FLIGHT_STATUSES })
      .andWhere('detail.last_attempt_at < :staleBefore', {
        staleBefore: new Date(now - STALE_AFTER_MS),
      })
      .andWhere('request.status <> :scheduled', { scheduled: NotificationStatus.SCHEDULED })
      .groupBy('detail.batch_id')
      .addGroupBy('detail.notification_request_id')
      .addGroupBy('request.tenant_id')
      .addGroupBy('detail.channel')
      .orderBy('MIN(detail.last_attempt_at)', 'ASC')
      .limit(BATCHES_PER_PASS)
      .getRawMany<StaleBatch>()
  }

  async reconcileBatch(batch: StaleBatch): Promise<ReconcileOutcome> {
    const queue = batch.channel === NotificationChannel.SMS ? this.smsQueue : this.emailQueue
    if (!queue || !this.redis) throw new Error(`No queue for channel ${batch.channel}`)

    const job = await queue.getJob(batch.batchId)
    const state = job ? await job.getState() : null
    if (state && LIVE_JOB_STATES.has(state)) return 'in-progress'

    const key = attemptsKey(batch.batchId)
    const attempt = await this.redis.incr(key)
    await this.redis.expire(key, ATTEMPTS_TTL_SECONDS)
    if (attempt > MAX_RECOVERY_ATTEMPTS) {
      await this.giveUp(batch, attempt - 1)
      return 'gave-up'
    }

    if (job && state === 'failed') {
      this.logger.warn(
        `[${batch.notifyId}] Retrying failed batch ${batch.batchId} (recovery ${attempt}/${MAX_RECOVERY_ATTEMPTS}): ${job.failedReason ?? 'no reason'}`,
      )
      await job.retry()
      return 'retried'
    }

    // Finished or gone while recipients are still owed: replace it with one built from Postgres.
    if (job) await job.remove().catch(() => undefined)
    await queue.add(await this.rebuildJob(batch), {
      jobId: batch.batchId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: FAILED_JOB_RETENTION,
    })
    this.logger.warn(
      `[${batch.notifyId}] Re-queued batch ${batch.batchId} with no job (recovery ${attempt}/${MAX_RECOVERY_ATTEMPTS})`,
    )
    return 'requeued'
  }

  /** The batch's job as ingestion queued it: shared content and params, recipients left in Postgres. */
  private async rebuildJob(batch: StaleBatch): Promise<DeliveryJobPayload> {
    const request = await this.requestRepository.findOne({
      where: { id: batch.notifyId },
      select: { id: true, payload: true },
    })
    if (!request) throw new Error('Parent notification request not found')

    const channel = batch.channel as NotificationChannel
    const mailMergeData = mergeContentFromRequest(request.payload, channel)
    return {
      notifyId: batch.notifyId,
      tenantId: batch.tenantId,
      channel,
      request: { templateId: mailMergeData.content?.templateId } as DeliveryJobPayload['request'],
      payload: {} as DeliveryJobPayload['payload'],
      attempt: 0,
      mailMerge: true,
      batchId: batch.batchId,
      mailMergeData,
    }
  }

  /**
   * Stop recovering a batch that keeps failing: mark what it still owes failed and settle the
   * parent's status the way a finishing batch would, so the send ends visibly.
   */
  private async giveUp(batch: StaleBatch, attempts: number): Promise<void> {
    await this.detailRepository.update(
      {
        notificationRequestId: batch.notifyId,
        batchId: batch.batchId,
        status: In(IN_FLIGHT_STATUSES),
      },
      {
        status: 'failed',
        errorMessage: `Not delivered: the batch failed ${attempts} recovery attempt(s)`,
        lastAttemptAt: new Date(),
        updatedBy: 'batch-reconciler',
      },
    )
    this.logger.error(
      `[${batch.notifyId}] Gave up on batch ${batch.batchId} after ${attempts} recovery attempt(s); remaining recipients marked failed`,
    )

    const remaining = await this.detailRepository.count({
      where: { notificationRequestId: batch.notifyId, status: In(IN_FLIGHT_STATUSES) },
    })
    if (remaining > 0) return
    const sent = await this.detailRepository.count({
      where: { notificationRequestId: batch.notifyId, status: 'sent' },
    })
    await this.notificationService.update(batch.notifyId, batch.tenantId, {
      status: sent > 0 ? NotificationStatus.PARTIALLY_COMPLETED : NotificationStatus.FAILED,
      updatedBy: 'batch-reconciler',
    })
  }
}
