import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindOptionsWhere, In, IsNull, Repository } from 'typeorm'
import { randomUUID } from 'node:crypto'
import type Bull from 'bull'
import type Redis from 'ioredis'
import { NotificationRequestDetail } from '../../api/notification/entities/notification-request-detail.entity'
import { NotificationRequest } from '../../api/notification/entities/notification-request.entity'
import { NotificationService } from '../../api/notification/notification.service'
import { IN_FLIGHT_DETAIL_STATUSES } from '../../api/notification/notification-request-detail.service'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { ProviderToken } from '../../enum/provider-token.enum'
import { QueueName } from '../../enum/queue-name.enum'
import { redisKey } from '../../common/redis/redis-namespace'
import { COMPLETED_JOB_RETENTION, FAILED_JOB_RETENTION } from '../job-retention'
import {
  delayUntilScheduled,
  ingestionJobFromRequest,
  mergeContentFromRequest,
} from '../merge-batch-builder'
import type { DeliveryJobPayload } from '../queue.types'
import { recordReconcilePass } from '../reconcile-activity'
import type { ReconcileActionRecord, ReconcileKind } from '../reconcile-activity'

const intFromEnv = (name: string, fallback: number) => {
  const value = Number.parseInt(process.env[name] || '', 10)
  return Number.isFinite(value) ? value : fallback
}

const RECONCILE_INTERVAL_MS = intFromEnv('DELIVERY_RECONCILE_INTERVAL_MS', 60_000)
/** How long work may sit unfinished before its job is checked. */
const STALE_AFTER_MS = intFromEnv('DELIVERY_RECONCILE_STALE_MS', 10 * 60_000)
/** Recovery attempts per job before what it still owes is marked failed. */
const MAX_RECOVERY_ATTEMPTS = intFromEnv('DELIVERY_RECONCILE_MAX_ATTEMPTS', 5)
/**
 * How long a request may stay PENDING - stored, but its ingestion job not yet queued - before it
 * is queued from here. Short: PENDING normally lasts milliseconds, and when it does not, Redis
 * was unreachable at acceptance and the request has nothing else to move it.
 */
const PENDING_STALE_MS = intFromEnv('DELIVERY_RECONCILE_PENDING_STALE_MS', 30_000)
const ITEMS_PER_KIND_PER_PASS = 50

const LOCK_KEY = redisKey('delivery-reconcile:lock')
const attemptsKey = (item: StuckWork) =>
  redisKey(`delivery-reconcile:attempts:${item.kind}:${item.jobId}`)
const ATTEMPTS_TTL_SECONDS = 7 * 24 * 60 * 60

/**
 * Release only our own lock. A pass that overran its TTL must not delete the lock a different
 * pod has since taken, or two pods would reconcile at once.
 */
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`

/** Bull states in which a job will still run without help. */
const LIVE_JOB_STATES = new Set(['waiting', 'active', 'delayed', 'paused'])
const DELIVERY_CHANNELS = [NotificationChannel.EMAIL, NotificationChannel.SMS]

const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
} as const

export type ReconcileOutcome = 'in-progress' | 'retried' | 'requeued' | 'gave-up'

/**
 * Work Postgres says is owed, keyed by the Bull job that should be doing it:
 *   - `pending`: a request stored but never queued (Redis unreachable at acceptance), job
 *     `<notifyId>` on ingestion;
 *   - `ingestion`: a request queued but never fanned out, job `<notifyId>` on ingestion;
 *   - `scheduled`: a scheduled send past its send time but never fanned out, job `<notifyId>` on
 *     ingestion (its delayed job was lost or failed);
 *   - `batch`: a merge batch's recipients, job `<batchId>` on the channel's delivery queue;
 *   - `delivery`: a plain send's recipients on one channel, job `<notifyId>_<channel>`.
 */
interface StuckWork {
  kind: ReconcileKind
  jobId: string
  notifyId: string
  tenantId: string
  channel?: string
  batchId?: string
}

/**
 * Finds work Postgres says is still owed but no job is left to do, and puts it back on a queue -
 * from a request that never reached Redis at all to one batch of a merge that lost its job.
 *
 * The queue's own recovery covers a worker dying mid-job: Bull notices the lapsed lock and
 * retries. It does not cover a job that ends up failed (out of retries, or stalled more often
 * than maxStalledCount) or one that never reached Redis; what it owed would stay pending forever.
 * Postgres is the record of what is owed, so this compares it with what the queue holds:
 *   - a live job (waiting, active, delayed) is left alone - a long batch is not stuck;
 *   - a failed job is retried with its original payload;
 *   - a missing or finished job is replaced: a merge batch rebuilt from the stored request, and
 *     anything else by running ingestion for the request again.
 * Every path is safe to repeat: merge batches skip recipients already sent, and a re-run of
 * ingestion writes no rows twice and skips channels already finished. After
 * MAX_RECOVERY_ATTEMPTS the work still owed is marked failed and the request settled, so a send
 * that can never succeed (a deleted template, a rejected sender) ends visibly instead of looping.
 *
 * One pod at a time, behind a Redis lock, every RECONCILE_INTERVAL_MS.
 */
@Injectable()
export class DeliveryReconcilerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DeliveryReconcilerService.name)
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
    @Optional() @Inject(QueueName.INGESTION) private readonly ingestionQueue?: Bull.Queue | null,
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

    const startedAt = Date.now()
    try {
      const staleBefore = new Date(now - STALE_AFTER_MS)
      const items = [
        ...(await this.findPendingRequests(new Date(now - PENDING_STALE_MS))),
        ...(await this.findStuckIngestions(staleBefore)),
        ...(await this.findOverdueScheduled(staleBefore)),
        ...(await this.findStaleBatches(staleBefore)),
        ...(await this.findStaleDeliveries(staleBefore)),
      ]
      const actions: ReconcileActionRecord[] = []
      for (const item of items) {
        try {
          const outcome = await this.reconcileItem(item)
          outcomes[outcome] = (outcomes[outcome] ?? 0) + 1
          if (outcome !== 'in-progress') {
            const { kind, jobId, notifyId, tenantId } = item
            actions.push({ at: Date.now(), kind, action: outcome, jobId, notifyId, tenantId })
          }
        } catch (error) {
          this.logger.error(
            `[${item.notifyId}] Could not reconcile ${item.kind} ${item.jobId}: ${(error as Error).message}`,
          )
        }
      }
      const acted = (outcomes.retried ?? 0) + (outcomes.requeued ?? 0) + (outcomes['gave-up'] ?? 0)
      if (acted > 0) this.logger.warn(`Delivery reconcile: ${JSON.stringify(outcomes)}`)
      const pass = {
        at: now,
        durationMs: Date.now() - startedAt,
        intervalMs: RECONCILE_INTERVAL_MS,
        found: items.length,
        outcomes,
      }
      await recordReconcilePass(this.redis, pass, actions).catch((error: Error) =>
        this.logger.warn(`Could not record the reconcile pass: ${error.message}`),
      )
    } catch (error) {
      this.logger.error(`Delivery reconcile pass failed: ${(error as Error).message}`)
    } finally {
      await this.redis
        .eval(RELEASE_LOCK_SCRIPT, 1, LOCK_KEY, this.instanceId)
        .catch(() => undefined)
    }
    return outcomes
  }

  /** Merge batches with a recipient in flight longer than the stale window; scheduled sends excluded. */
  private async findStaleBatches(staleBefore: Date): Promise<StuckWork[]> {
    const rows = await this.inFlightRows(staleBefore)
      .andWhere('detail.batch_id IS NOT NULL')
      .select('detail.batch_id', 'batchId')
      .addSelect('detail.notification_request_id', 'notifyId')
      .addSelect('request.tenant_id', 'tenantId')
      .addSelect('detail.channel', 'channel')
      .groupBy('detail.batch_id')
      .addGroupBy('detail.notification_request_id')
      .addGroupBy('request.tenant_id')
      .addGroupBy('detail.channel')
      .orderBy('MIN(detail.last_attempt_at)', 'ASC')
      .limit(ITEMS_PER_KIND_PER_PASS)
      .getRawMany<{ batchId: string; notifyId: string; tenantId: string; channel: string }>()
    return rows.map((row) => ({ kind: 'batch', jobId: row.batchId, ...row }))
  }

  /** Plain sends: recipients outside any batch, in flight on one channel past the stale window. */
  private async findStaleDeliveries(staleBefore: Date): Promise<StuckWork[]> {
    const rows = await this.inFlightRows(staleBefore)
      .andWhere('detail.batch_id IS NULL')
      .andWhere('detail.channel IN (:...channels)', { channels: DELIVERY_CHANNELS })
      .select('detail.notification_request_id', 'notifyId')
      .addSelect('request.tenant_id', 'tenantId')
      .addSelect('detail.channel', 'channel')
      .groupBy('detail.notification_request_id')
      .addGroupBy('request.tenant_id')
      .addGroupBy('detail.channel')
      .orderBy('MIN(detail.last_attempt_at)', 'ASC')
      .limit(ITEMS_PER_KIND_PER_PASS)
      .getRawMany<{ notifyId: string; tenantId: string; channel: string }>()
    return rows.map((row) => ({
      kind: 'delivery',
      jobId: `${row.notifyId}_${row.channel}`,
      ...row,
    }))
  }

  /**
   * Requests still QUEUED past the stale window: accepted, but ingestion never fanned them out.
   * A plain send that already has rows is left to findStaleDeliveries - ingestion got that far,
   * and its recipients may already be sent. A merge is safe to re-ingest either way.
   */
  private async findStuckIngestions(staleBefore: Date): Promise<StuckWork[]> {
    if (!this.ingestionQueue) return []
    const rows = await this.requestRepository
      .createQueryBuilder('request')
      .select('request.id', 'notifyId')
      .addSelect('request.tenant_id', 'tenantId')
      .where('request.status = :queued', { queued: NotificationStatus.QUEUED })
      .andWhere('request.updated_at < :staleBefore', { staleBefore })
      .andWhere(
        `(jsonb_exists(request.payload -> 'email' -> 'recipients', 'mergeArray')
          OR jsonb_exists(request.payload -> 'sms' -> 'recipients', 'mergeArray')
          OR NOT EXISTS (
            SELECT 1 FROM notify.notification_request_detail detail
             WHERE detail.notification_request_id = request.id AND detail.status <> 'blocked'))`,
      )
      .orderBy('request.updated_at', 'ASC')
      .limit(ITEMS_PER_KIND_PER_PASS)
      .getRawMany<{ notifyId: string; tenantId: string }>()
    return rows.map((row) => ({ kind: 'ingestion', jobId: row.notifyId, ...row }))
  }

  /**
   * Scheduled sends still SCHEDULED a stale window after their send time. Ingestion moves a
   * scheduled send to PROCESSING when its delayed job runs, so one still waiting this long has a
   * job that was lost or failed. Before its send time a scheduled send is never checked: its job
   * is meant to be sitting delayed, and checking every future send each pass would not scale.
   */
  private async findOverdueScheduled(staleBefore: Date): Promise<StuckWork[]> {
    if (!this.ingestionQueue) return []
    const rows = await this.requestRepository
      .createQueryBuilder('request')
      .select('request.id', 'notifyId')
      .addSelect('request.tenant_id', 'tenantId')
      .where('request.status = :scheduled', { scheduled: NotificationStatus.SCHEDULED })
      .andWhere('request.delayed_send_time < :staleBefore', { staleBefore })
      .orderBy('request.delayed_send_time', 'ASC')
      .limit(ITEMS_PER_KIND_PER_PASS)
      .getRawMany<{ notifyId: string; tenantId: string }>()
    return rows.map((row) => ({ kind: 'scheduled', jobId: row.notifyId, ...row }))
  }

  /** Requests still PENDING: stored at acceptance, but their ingestion job never queued. Oldest first. */
  private async findPendingRequests(pendingBefore: Date): Promise<StuckWork[]> {
    if (!this.ingestionQueue) return []
    const rows = await this.requestRepository
      .createQueryBuilder('request')
      .select('request.id', 'notifyId')
      .addSelect('request.tenant_id', 'tenantId')
      .where('request.status = :pending', { pending: NotificationStatus.PENDING })
      .andWhere('request.created_at < :pendingBefore', { pendingBefore })
      .orderBy('request.created_at', 'ASC')
      .limit(ITEMS_PER_KIND_PER_PASS)
      .getRawMany<{ notifyId: string; tenantId: string }>()
    return rows.map((row) => ({ kind: 'pending', jobId: row.notifyId, ...row }))
  }

  private inFlightRows(staleBefore: Date) {
    return this.detailRepository
      .createQueryBuilder('detail')
      .innerJoin('detail.notificationRequest', 'request')
      .where('detail.status IN (:...statuses)', { statuses: IN_FLIGHT_DETAIL_STATUSES })
      .andWhere('detail.last_attempt_at < :staleBefore', { staleBefore })
      .andWhere('request.status <> :scheduled', { scheduled: NotificationStatus.SCHEDULED })
  }

  private queueFor(item: StuckWork): Bull.Queue | null | undefined {
    if (item.kind === 'ingestion' || item.kind === 'pending' || item.kind === 'scheduled')
      return this.ingestionQueue
    return item.channel === NotificationChannel.SMS ? this.smsQueue : this.emailQueue
  }

  async reconcileItem(item: StuckWork): Promise<ReconcileOutcome> {
    const queue = this.queueFor(item)
    if (!queue || !this.redis)
      throw new Error(`No queue for ${item.kind} on ${item.channel ?? '-'}`)

    const job = await queue.getJob(item.jobId)
    const state = job ? await job.getState() : null
    if (state && LIVE_JOB_STATES.has(state)) return 'in-progress'

    // A plain send is replaced by re-running ingestion; while that runs, it is in hand.
    if (item.kind === 'delivery' && (await this.ingestionLive(item.notifyId))) return 'in-progress'

    const key = attemptsKey(item)
    const attempt = await this.redis.incr(key)
    await this.redis.expire(key, ATTEMPTS_TTL_SECONDS)
    if (attempt > MAX_RECOVERY_ATTEMPTS) {
      await this.giveUp(item, attempt - 1)
      return 'gave-up'
    }

    if (job && state === 'failed') {
      this.logger.warn(
        `[${item.notifyId}] Retrying failed ${item.kind} ${item.jobId} (recovery ${attempt}/${MAX_RECOVERY_ATTEMPTS}): ${job.failedReason ?? 'no reason'}`,
      )
      await job.retry()
      return 'retried'
    }

    // Finished or gone while work is still owed: replace it.
    if (job) await job.remove().catch(() => undefined)
    if (item.kind === 'batch') {
      await queue.add(await this.rebuildBatchJob(item), {
        jobId: item.jobId,
        ...JOB_OPTIONS,
        removeOnComplete: true,
        removeOnFail: FAILED_JOB_RETENTION,
      })
    } else {
      await this.reingest(item)
    }
    this.logger.warn(
      `[${item.notifyId}] Re-queued ${item.kind} ${item.jobId} with no job (recovery ${attempt}/${MAX_RECOVERY_ATTEMPTS})`,
    )
    return 'requeued'
  }

  private async ingestionLive(notifyId: string): Promise<boolean> {
    const job = await this.ingestionQueue?.getJob(notifyId)
    return !!job && LIVE_JOB_STATES.has(await job.getState())
  }

  /**
   * Run ingestion for the request again, from the stored request. A finished ingestion job of the
   * same id is removed first, or Bull would treat the add as a duplicate and do nothing. A
   * scheduled send keeps its delay. A request recovered from PENDING then moves on as acceptance
   * would have moved it - to SCHEDULED or QUEUED - so it leaves this finder.
   */
  private async reingest(item: StuckWork): Promise<void> {
    if (!this.ingestionQueue) throw new Error('No ingestion queue')
    const request = await this.requestRepository.findOne({
      where: { id: item.notifyId },
      select: { id: true, tenantId: true, payload: true, createdAt: true },
    })
    if (!request) throw new Error('Notification request not found')

    const job = ingestionJobFromRequest(request)
    const delay = delayUntilScheduled(job)
    const previous = await this.ingestionQueue.getJob(item.notifyId)
    if (previous) await previous.remove().catch(() => undefined)
    await this.ingestionQueue.add(job, {
      jobId: item.notifyId,
      ...JOB_OPTIONS,
      ...(delay > 0 && { delay }),
      removeOnComplete: COMPLETED_JOB_RETENTION,
      removeOnFail: FAILED_JOB_RETENTION,
    })

    if (item.kind === 'pending') {
      await this.notificationService.update(item.notifyId, item.tenantId, {
        status: delay > 0 ? NotificationStatus.SCHEDULED : NotificationStatus.QUEUED,
        updatedBy: 'delivery-reconciler',
      })
    }
  }

  /** The batch's job as ingestion queued it: shared content and params, recipients left in Postgres. */
  private async rebuildBatchJob(item: StuckWork): Promise<DeliveryJobPayload> {
    const request = await this.requestRepository.findOne({
      where: { id: item.notifyId },
      select: { id: true, payload: true },
    })
    if (!request) throw new Error('Parent notification request not found')

    const channel = item.channel as NotificationChannel
    const mailMergeData = mergeContentFromRequest(request.payload, channel)
    return {
      notifyId: item.notifyId,
      tenantId: item.tenantId,
      channel,
      request: { templateId: mailMergeData.content?.templateId } as DeliveryJobPayload['request'],
      payload: {} as DeliveryJobPayload['payload'],
      attempt: 0,
      mailMerge: true,
      batchId: item.batchId,
      mailMergeData,
    }
  }

  /**
   * Stop recovering work that keeps failing: mark what it still owes failed and settle the
   * request's status the way a finishing job would, so the send ends visibly.
   */
  private async giveUp(item: StuckWork, attempts: number): Promise<void> {
    const owed: FindOptionsWhere<NotificationRequestDetail> = {
      notificationRequestId: item.notifyId,
      status: In(IN_FLIGHT_DETAIL_STATUSES),
      ...(item.kind === 'batch' && { batchId: item.batchId }),
      ...(item.kind === 'delivery' && { batchId: IsNull(), channel: item.channel }),
    }
    await this.detailRepository.update(owed, {
      status: 'failed',
      errorMessage: `Not delivered: the ${item.kind} failed ${attempts} recovery attempt(s)`,
      lastAttemptAt: new Date(),
      updatedBy: 'delivery-reconciler',
    })
    this.logger.error(
      `[${item.notifyId}] Gave up on ${item.kind} ${item.jobId} after ${attempts} recovery attempt(s); what it owed is marked failed`,
    )

    const remaining = await this.detailRepository.count({
      where: { notificationRequestId: item.notifyId, status: In(IN_FLIGHT_DETAIL_STATUSES) },
    })
    if (remaining > 0) return
    const sent = await this.detailRepository.count({
      where: { notificationRequestId: item.notifyId, status: 'sent' },
    })
    await this.notificationService.update(item.notifyId, item.tenantId, {
      status: sent > 0 ? NotificationStatus.PARTIALLY_COMPLETED : NotificationStatus.FAILED,
      updatedBy: 'delivery-reconciler',
    })
  }
}
