import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import type Bull from 'bull'
import type Redis from 'ioredis'
import { QueueName } from '../../../enum/queue-name.enum'
import { ProviderToken } from '../../../enum/provider-token.enum'
import { Tenant } from '../tenants/entities/tenant.entity'
import { NotificationRequestDetail } from '../../notification/entities/notification-request-detail.entity'
import { NotificationStatus } from '../../../enum/notification-status.enum'
import { NotificationChannel } from '../../../enum/notification-channel.enum'
import { readBatchProgress } from '../../../queue/batch-progress'
import type { BatchProgress } from '../../../queue/batch-progress'
import {
  MONITORING_WINDOW_MINUTES,
  addedCounterKey,
  alignBullMetrics,
  bullKey,
  minuteOf,
} from '../../../queue/queue-metrics'
import type { BullMetrics } from '../../../queue/queue-metrics'
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TTL_SECONDS,
  WORKER_INDEX_KEY,
  workerHeartbeatKey,
} from '../../../queue/worker-heartbeat'
import type { WorkerHeartbeatPayload } from '../../../queue/worker-heartbeat'
import { MONITORING_THRESHOLDS } from './monitoring-thresholds'
import type {
  HealthStatus,
  MessageChannelStatsDto,
  MonitoringOverviewDto,
  QueueMonitoringResponseDto,
  QueueStatsDto,
  RedisStatsDto,
  WorkerPodDto,
} from './schemas/queue-monitoring.dto'

const FAILURES_PER_QUEUE = 10
const ACTIVE_JOBS_PER_QUEUE = 50
/**
 * A worker's heartbeat can lag what it is doing by one interval, so an active job younger than
 * two intervals may be held by a live worker that has not reported it yet.
 */
const UNHELD_GRACE_MS = HEARTBEAT_INTERVAL_MS * 2
/** Detail statuses between acceptance and a final sent/failed. */
const IN_FLIGHT_DETAIL_STATUSES = ['pending', 'queued', 'processing', 'sending']
/** Older in-flight rows are abandoned, not backlog, and would pin "oldest pending" forever. */
const PENDING_LOOKBACK_MS = 24 * 60 * 60 * 1000
/** A longer pause between consecutive sends is idle time, not part of how fast sending runs. */
const IDLE_GAP_SECONDS = 30
const MIN_RATE_MESSAGES = 10
const MIN_RATE_BUSY_SECONDS = 5
const DEFAULT_MESSAGE_CHANNELS = [NotificationChannel.EMAIL, NotificationChannel.SMS]
const RECENT_FAILURES_LIMIT = 20
/** A failure rate over a handful of jobs is noise; below this many finished jobs it is ignored. */
const MIN_JOBS_FOR_FAILURE_RATE = 10

const SEVERITY: Record<HealthStatus, number> = { healthy: 0, warning: 1, critical: 2 }

export function worstStatus(statuses: HealthStatus[]): HealthStatus {
  return statuses.reduce<HealthStatus>(
    (worst, status) => (SEVERITY[status] > SEVERITY[worst] ? status : worst),
    'healthy',
  )
}

/** Parse the `field:value` lines of Redis INFO into a flat map. */
export function parseRedisInfo(info: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const line of info.split(/\r?\n/)) {
    const index = line.indexOf(':')
    if (index > 0 && !line.startsWith('#')) {
      fields[line.slice(0, index)] = line.slice(index + 1).trim()
    }
  }
  return fields
}

/**
 * Bull's failure reasons are provider error messages, which can quote the recipient. The page
 * is for spotting patterns, so addresses and numbers are masked before they leave the backend.
 */
export function maskPersonalData(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[phone]')
}

export function buildRedisStats(info: Record<string, string>): RedisStatsDto {
  const num = (key: string) => Number(info[key] ?? 0) || 0
  const usedMemoryBytes = num('used_memory')
  const maxMemoryBytes = num('maxmemory') || null
  const usedMemoryPercent =
    maxMemoryBytes === null ? null : Math.round((usedMemoryBytes / maxMemoryBytes) * 1000) / 10
  const maxMemoryPolicy = info.maxmemory_policy ?? 'unknown'
  const evictedKeys = num('evicted_keys')
  const rejectedConnections = num('rejected_connections')

  const reasons: string[] = []
  const statuses: HealthStatus[] = []
  const { redisMemoryCriticalPercent, redisMemoryWarningPercent } = MONITORING_THRESHOLDS

  if (usedMemoryPercent !== null && usedMemoryPercent >= redisMemoryCriticalPercent) {
    statuses.push('critical')
    reasons.push(`Memory is at ${usedMemoryPercent}% of the cap`)
  } else if (usedMemoryPercent !== null && usedMemoryPercent >= redisMemoryWarningPercent) {
    statuses.push('warning')
    reasons.push(`Memory is at ${usedMemoryPercent}% of the cap`)
  }
  if (maxMemoryPolicy !== 'noeviction') {
    statuses.push('critical')
    reasons.push(`Eviction policy is ${maxMemoryPolicy}; Bull jobs can be silently dropped`)
  }
  if (evictedKeys > 0) {
    statuses.push('critical')
    reasons.push(`${evictedKeys.toLocaleString()} keys have been evicted`)
  }
  if (rejectedConnections > 0) {
    statuses.push('warning')
    reasons.push(`${rejectedConnections.toLocaleString()} connections have been rejected`)
  }

  const fragmentation = Number(info.mem_fragmentation_ratio)
  return {
    status: worstStatus(statuses),
    reasons,
    usedMemoryBytes,
    peakMemoryBytes: num('used_memory_peak'),
    maxMemoryBytes,
    usedMemoryPercent,
    maxMemoryPolicy,
    fragmentationRatio: Number.isFinite(fragmentation) ? fragmentation : null,
    evictedKeys,
    rejectedConnections,
    connectedClients: num('connected_clients'),
    blockedClients: num('blocked_clients'),
    opsPerSecond: num('instantaneous_ops_per_sec'),
    uptimeSeconds: num('uptime_in_seconds'),
    version: info.redis_version ?? 'unknown',
  }
}

/** Mean of the last `window` whole minutes; the final entry is the current partial minute. */
export function averageOfWholeMinutes(series: number[], window: number): number {
  const whole = series.slice(-(window + 1), -1)
  if (whole.length === 0) return 0
  const total = whole.reduce((sum, value) => sum + value, 0)
  return Math.round((total / whole.length) * 10) / 10
}

type QueueEvaluationInput = Omit<QueueStatsDto, 'status' | 'reasons' | 'estimatedDrainMinutes'>

export function evaluateQueue(input: QueueEvaluationInput): QueueStatsDto {
  const { counts, throughput, oldestWaitingAgeMs, isPaused, liveWorkerPods } = input
  const t = MONITORING_THRESHOLDS
  const statuses: HealthStatus[] = []
  const reasons: string[] = []
  const backlog = counts.waiting + counts.paused

  if (isPaused) {
    statuses.push('warning')
    reasons.push('Queue is paused')
  }
  if (input.unheldActiveJobs > 0) {
    statuses.push('warning')
    reasons.push(
      `${input.unheldActiveJobs} active job(s) not held by any live worker (possibly stalled; Bull retries stalled jobs within about a minute)`,
    )
  }
  if (backlog > 0 && liveWorkerPods === 0) {
    statuses.push('critical')
    reasons.push('Jobs are waiting but no pod is processing this queue')
  }
  if (oldestWaitingAgeMs !== null && oldestWaitingAgeMs >= t.oldestWaitingCriticalMs) {
    statuses.push('critical')
    reasons.push('Oldest job has waited longer than the critical threshold')
  } else if (oldestWaitingAgeMs !== null && oldestWaitingAgeMs >= t.oldestWaitingWarningMs) {
    statuses.push('warning')
    reasons.push('Oldest job has waited longer than the warning threshold')
  }

  const recentFinished = throughput.outPerMinute * t.rateWindowMinutes
  if (recentFinished >= MIN_JOBS_FOR_FAILURE_RATE) {
    if (throughput.failureRatePercent >= t.failureRateCriticalPercent) {
      statuses.push('critical')
      reasons.push(`${throughput.failureRatePercent}% of recent jobs failed`)
    } else if (throughput.failureRatePercent >= t.failureRateWarningPercent) {
      statuses.push('warning')
      reasons.push(`${throughput.failureRatePercent}% of recent jobs failed`)
    }
  }

  const growing = throughput.inPerMinute > throughput.outPerMinute
  if (backlog > 0 && growing) {
    statuses.push('warning')
    reasons.push('Jobs are arriving faster than they are finishing')
  }

  let estimatedDrainMinutes: number | null = null
  if (backlog === 0) {
    estimatedDrainMinutes = 0
  } else if (throughput.outPerMinute > throughput.inPerMinute) {
    estimatedDrainMinutes = Math.ceil(backlog / (throughput.outPerMinute - throughput.inPerMinute))
  }

  return { ...input, status: worstStatus(statuses), reasons, estimatedDrainMinutes }
}

type JobIdentifiers = { notifyId?: unknown; notificationId?: unknown; tenantId?: unknown }
type QueuedJob = { queue: string; job: Bull.Job }

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** Only identifiers leave the job: its data also holds recipients and message content. */
function jobIdentifiers(job: Bull.Job, tenantNames: Map<string, string>) {
  const data = (job.data ?? {}) as JobIdentifiers
  const tenantId = asString(data.tenantId)
  return {
    notificationId: asString(data.notifyId) ?? asString(data.notificationId),
    tenantId,
    tenantName: tenantId ? (tenantNames.get(tenantId) ?? null) : null,
  }
}

/** Active jobs that report merge-batch progress; other jobs finish too fast to need a bar. */
function activeBatches(
  activeByQueue: Map<string, Bull.Job[]>,
): Array<QueuedJob & { progress: BatchProgress }> {
  return [...activeByQueue.entries()]
    .flatMap(([queue, jobs]) =>
      jobs.flatMap((job) => {
        const progress = readBatchProgress(job.progress())
        return progress ? [{ queue, job, progress }] : []
      }),
    )
    .sort((a, b) => (a.job.processedOn ?? 0) - (b.job.processedOn ?? 0))
}

/**
 * Active jobs no live worker reports holding. A job stays "active" in Redis after the pod
 * processing it dies, until Bull's stalled-job check moves it back to waiting, so these are
 * likely stalled. Only jobs older than UNHELD_GRACE_MS are counted, to allow for heartbeat lag.
 */
export function countUnheldActiveJobs(
  queueName: string,
  activeJobs: Bull.Job[],
  workers: WorkerPodDto[],
  now: number,
): number {
  const settled = activeJobs.filter(
    (job) => job.processedOn && job.processedOn <= now - UNHELD_GRACE_MS,
  ).length
  const held = workers
    .flatMap((pod) => pod.queues)
    .filter((q) => q.queue === queueName)
    .reduce((sum, q) => sum + q.active, 0)
  return Math.max(0, settled - held)
}

/**
 * Turn busy sending time into a per-minute rate, or null when there is too little to go on: a
 * handful of messages, or a few seconds, extrapolate to a minute badly.
 */
export function sendingRateFrom(
  busyMessages: number,
  busySeconds: number,
): MonitoringOverviewDto['sendingRate'] {
  if (busyMessages < MIN_RATE_MESSAGES || busySeconds < MIN_RATE_BUSY_SECONDS) return null
  return {
    perMinute: Math.round((busyMessages / busySeconds) * 60 * 10) / 10,
    messages: busyMessages,
    busySeconds: Math.round(busySeconds),
  }
}

export function buildOverview(
  messages: MessageChannelStatsDto[],
  queues: QueueStatsDto[],
  deliveryTime: MonitoringOverviewDto['deliveryTime'],
  sendingRate: MonitoringOverviewDto['sendingRate'],
): MonitoringOverviewDto {
  const sumSeries = (pick: (m: MessageChannelStatsDto) => number[]) =>
    messages.reduce((total, m) => total + pick(m).reduce((a, b) => a + b, 0), 0)
  const messagesSent = sumSeries((m) => m.sent)
  const messagesFailed = sumSeries((m) => m.failed)
  const finished = messagesSent + messagesFailed
  const ingestion = queues.find((queue) => queue.name === QueueName.INGESTION)

  return {
    windowMinutes: MONITORING_WINDOW_MINUTES,
    deliveryTime,
    messagesSent,
    messagesFailed,
    sendingRate,
    failurePercent: finished > 0 ? Math.round((messagesFailed / finished) * 1000) / 10 : 0,
    requestsReceived: ingestion ? ingestion.throughput.added.reduce((a, b) => a + b, 0) : 0,
  }
}

/**
 * Read-only view of the Bull queues, their workers and the Redis instance behind them, for the
 * admin monitoring page. Everything is read from Redis on each request, so the answer is the
 * same whichever pod serves it.
 */
@Injectable()
export class MonitoringService {
  private readonly queues: Bull.Queue[]

  constructor(
    @Optional() @Inject(ProviderToken.REDIS_CLIENT) private readonly redis: Redis | null,
    @Optional() @Inject(QueueName.INGESTION) ingestionQueue: Bull.Queue | null,
    @Optional() @Inject(QueueName.EMAIL_DELIVERY) emailQueue: Bull.Queue | null,
    @Optional() @Inject(QueueName.SMS_DELIVERY) smsQueue: Bull.Queue | null,
    @Optional() @Inject(QueueName.WEBHOOK_DELIVERY) webhookQueue: Bull.Queue | null,
    @InjectRepository(Tenant) private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(NotificationRequestDetail)
    private readonly detailRepository: Repository<NotificationRequestDetail>,
  ) {
    this.queues = [ingestionQueue, emailQueue, smsQueue, webhookQueue].filter(
      (queue): queue is Bull.Queue => !!queue,
    )
  }

  async getQueueMonitoring(): Promise<QueueMonitoringResponseDto> {
    if (!this.redis || this.queues.length === 0) {
      throw new ServiceUnavailableException(
        'Queue monitoring is unavailable: Redis is not configured',
      )
    }

    const now = Date.now()
    const [info, workers, messages, failedJobs, activeByQueue, deliveryTime, sendingRate] =
      await Promise.all([
        this.redis.info(),
        this.getWorkers(now),
        this.getMessageStats(now),
        this.getRecentFailedJobs(),
        this.getActiveJobs(),
        this.getDeliveryTime(now),
        this.getSendingRate(now),
      ])
    const redis = buildRedisStats(parseRedisInfo(info))
    const queues = await Promise.all(
      this.queues.map((queue) =>
        this.getQueueStats(queue, workers, activeByQueue.get(queue.name) ?? [], now),
      ),
    )
    const activeJobs = activeBatches(activeByQueue)
    const tenantNames = await this.getTenantNames(
      [...failedJobs, ...activeJobs].map(({ job }) =>
        asString((job.data as JobIdentifiers)?.tenantId),
      ),
    )

    return {
      generatedAt: new Date(now).toISOString(),
      status: worstStatus([redis.status, ...queues.map((queue) => queue.status)]),
      overview: buildOverview(messages, queues, deliveryTime, sendingRate),
      redis,
      messages,
      queues,
      activeBatches: activeJobs.map(({ queue, job, progress }) => ({
        queue,
        jobId: String(job.id),
        ...jobIdentifiers(job, tenantNames),
        ...progress,
        startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      })),
      workers,
      recentFailures: failedJobs.map(({ queue, job }) => ({
        queue,
        jobId: String(job.id),
        ...jobIdentifiers(job, tenantNames),
        reason: maskPersonalData(job.failedReason ?? 'No reason recorded'),
        attemptsMade: job.attemptsMade,
        failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      })),
    }
  }

  private async getQueueStats(
    queue: Bull.Queue,
    workers: WorkerPodDto[],
    activeJobs: Bull.Job[],
    now: number,
  ): Promise<QueueStatsDto> {
    const [counts, isPaused, oldestWaitingAgeMs, added, completed, failed] = await Promise.all([
      queue.getJobCounts(),
      queue.isPaused(),
      this.getOldestWaitingAge(queue, now),
      this.getAddedSeries(queue, now),
      queue.getMetrics('completed', 0, MONITORING_WINDOW_MINUTES - 1),
      queue.getMetrics('failed', 0, MONITORING_WINDOW_MINUTES - 1),
    ])

    const completedSeries = alignBullMetrics(completed as BullMetrics, now)
    const failedSeries = alignBullMetrics(failed as BullMetrics, now)
    const window = MONITORING_THRESHOLDS.rateWindowMinutes
    const completedPerMinute = averageOfWholeMinutes(completedSeries, window)
    const failedPerMinute = averageOfWholeMinutes(failedSeries, window)
    const outPerMinute = Math.round((completedPerMinute + failedPerMinute) * 10) / 10
    const failureRatePercent =
      outPerMinute > 0 ? Math.round((failedPerMinute / outPerMinute) * 1000) / 10 : 0

    return evaluateQueue({
      name: queue.name,
      isPaused,
      counts: {
        waiting: counts.waiting,
        active: counts.active,
        delayed: counts.delayed,
        failed: counts.failed,
        paused: (counts as Bull.JobCounts & { paused?: number }).paused ?? 0,
      },
      oldestWaitingAgeMs,
      throughput: {
        added,
        completed: completedSeries,
        failed: failedSeries,
        inPerMinute: averageOfWholeMinutes(added, window),
        outPerMinute,
        failureRatePercent,
      },
      liveWorkerPods: workers.filter((pod) => pod.queues.some((q) => q.queue === queue.name))
        .length,
      unheldActiveJobs: countUnheldActiveJobs(queue.name, activeJobs, workers, now),
    })
  }

  /**
   * Workers take from the right of the wait list, so its last entry is the next job out. A
   * delayed job (scheduled send or retry backoff) only became ready at timestamp + delay, which
   * is what its wait is measured from. Pausing moves the wait list to `paused`.
   */
  private async getOldestWaitingAge(queue: Bull.Queue, now: number): Promise<number | null> {
    const jobId =
      (await queue.client.lindex(bullKey(queue.name, 'wait'), -1)) ??
      (await queue.client.lindex(bullKey(queue.name, 'paused'), -1))
    if (!jobId) return null
    const job = await queue.getJob(jobId)
    if (!job) return null
    const readyAt = job.timestamp + (job.opts?.delay ?? 0)
    return Math.max(0, now - readyAt)
  }

  private async getAddedSeries(queue: Bull.Queue, now: number): Promise<number[]> {
    const currentMinute = minuteOf(now)
    const keys: string[] = []
    for (let offset = MONITORING_WINDOW_MINUTES - 1; offset >= 0; offset--) {
      keys.push(addedCounterKey(queue.name, currentMinute - offset))
    }
    const values = await queue.client.mget(...keys)
    return values.map((value) => Number(value ?? 0) || 0)
  }

  private async getWorkers(now: number): Promise<WorkerPodDto[]> {
    const redis = this.redis as Redis
    // Pods that stopped without cleaning up stay in the index until pruned here.
    await redis.zremrangebyscore(WORKER_INDEX_KEY, '-inf', now - HEARTBEAT_TTL_SECONDS * 2000)
    const podIds = await redis.zrange(WORKER_INDEX_KEY, 0, -1)
    if (podIds.length === 0) return []

    const payloads = await redis.mget(...podIds.map(workerHeartbeatKey))
    return payloads
      .filter((payload): payload is string => !!payload)
      .map((payload) => JSON.parse(payload) as WorkerHeartbeatPayload)
      .map((pod) => ({
        podId: pod.podId,
        startedAt: new Date(pod.startedAt).toISOString(),
        lastHeartbeatAt: new Date(pod.heartbeatAt).toISOString(),
        queues: pod.queues.map((q) => ({
          ...q,
          lastFinishedAt: q.lastFinishedAt ? new Date(q.lastFinishedAt).toISOString() : null,
        })),
      }))
      .sort((a, b) => a.podId.localeCompare(b.podId))
  }

  private async getRecentFailedJobs(): Promise<QueuedJob[]> {
    const perQueue = await Promise.all(
      this.queues.map(async (queue) => {
        const jobs = await queue.getFailed(0, FAILURES_PER_QUEUE - 1)
        return jobs.filter(Boolean).map((job) => ({ queue: queue.name, job }))
      }),
    )
    return perQueue
      .flat()
      .sort((a, b) => (b.job.finishedOn ?? 0) - (a.job.finishedOn ?? 0))
      .slice(0, RECENT_FAILURES_LIMIT)
  }

  private async getActiveJobs(): Promise<Map<string, Bull.Job[]>> {
    const perQueue = await Promise.all(
      this.queues.map(
        async (queue) =>
          [
            queue.name,
            (await queue.getActive(0, ACTIVE_JOBS_PER_QUEUE - 1)).filter(Boolean),
          ] as const,
      ),
    )
    return new Map(perQueue)
  }

  /**
   * Median and 95th percentile time to send, over recipients sent in the last hour. Timed from
   * the parent request's acceptance rather than the detail row's creation, which for a merge
   * send only happens once ingestion runs; a scheduled send is timed from when it fell due.
   */
  private async getDeliveryTime(now: number): Promise<MonitoringOverviewDto['deliveryTime']> {
    const since = new Date(now - MONITORING_WINDOW_MINUTES * 60_000)
    const elapsedMs =
      'EXTRACT(EPOCH FROM (detail.last_attempt_at - GREATEST(request.created_at, ' +
      'COALESCE(request.delayed_send_time, request.created_at)))) * 1000'
    const row = await this.detailRepository
      .createQueryBuilder('detail')
      .innerJoin('detail.notificationRequest', 'request')
      .select(`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${elapsedMs})`, 'median')
      .addSelect(`percentile_cont(0.95) WITHIN GROUP (ORDER BY ${elapsedMs})`, 'p95')
      .addSelect('COUNT(*)', 'messages')
      // Repeats the partial index predicate (V72) so the planner uses it, then narrows to sent.
      .where("detail.status IN ('sent', 'failed')")
      .andWhere("detail.status = 'sent'")
      .andWhere('detail.last_attempt_at >= :since', { since })
      .getRawOne<{ median: string | null; p95: string | null; messages: string }>()

    const messages = Number(row?.messages ?? 0)
    if (!row || messages === 0 || row.median === null || row.p95 === null) return null
    return {
      medianMs: Math.max(0, Math.round(Number(row.median))),
      p95Ms: Math.max(0, Math.round(Number(row.p95))),
      messages,
    }
  }

  /**
   * Sustained sending speed over the last hour, measured from the gaps between consecutive sends
   * rather than per-minute buckets, so a 30-second burst reads as its own pace instead of being
   * split across, or diluted by, the minutes around it. Concurrent workers shrink the gaps, so
   * this is the whole system's throughput, not one worker's.
   */
  private async getSendingRate(now: number): Promise<MonitoringOverviewDto['sendingRate']> {
    const since = new Date(now - MONITORING_WINDOW_MINUTES * 60_000)
    const table = this.detailRepository.metadata.tablePath
    // The status filter repeats the partial index predicate (V72) so the planner uses it.
    const [row] = (await this.detailRepository.query(
      `SELECT COUNT(*) FILTER (WHERE gap <= $2) AS busy_messages,
              COALESCE(SUM(gap) FILTER (WHERE gap <= $2), 0) AS busy_seconds
         FROM (
           SELECT EXTRACT(EPOCH FROM last_attempt_at - lag(last_attempt_at)
                    OVER (ORDER BY last_attempt_at)) AS gap
             FROM ${table}
            WHERE status IN ('sent', 'failed') AND status = 'sent' AND last_attempt_at >= $1
         ) gaps`,
      [since, IDLE_GAP_SECONDS],
    )) as Array<{ busy_messages: string; busy_seconds: string }>

    return sendingRateFrom(Number(row?.busy_messages ?? 0), Number(row?.busy_seconds ?? 0))
  }

  private async getTenantNames(ids: Array<string | null>): Promise<Map<string, string>> {
    const tenantIds = [...new Set(ids.filter((id): id is string => !!id))]
    if (tenantIds.length === 0) return new Map()
    const tenants = await this.tenantRepository.find({
      where: { id: In(tenantIds) },
      select: { id: true, name: true },
    })
    return new Map(tenants.map((tenant) => [tenant.id, tenant.name]))
  }

  /**
   * Recipient-level backlog and throughput per channel. Pending rows use the status index;
   * sent/failed rows use the partial index on last_attempt_at (V72), whose predicate the
   * status filter repeats literally so the planner can use it.
   */
  private async getMessageStats(now: number): Promise<MessageChannelStatsDto[]> {
    const since = new Date((minuteOf(now) - (MONITORING_WINDOW_MINUTES - 1)) * 60_000)

    const [pendingRows, finishedRows] = await Promise.all([
      this.detailRepository
        .createQueryBuilder('detail')
        .innerJoin('detail.notificationRequest', 'request')
        .select('detail.channel', 'channel')
        .addSelect('COUNT(*)', 'pending')
        .addSelect('MIN(detail.created_at)', 'oldest')
        .where('detail.status IN (:...statuses)', { statuses: IN_FLIGHT_DETAIL_STATUSES })
        .andWhere('request.status <> :scheduled', { scheduled: NotificationStatus.SCHEDULED })
        .andWhere('detail.created_at > :pendingSince', {
          pendingSince: new Date(now - PENDING_LOOKBACK_MS),
        })
        .groupBy('detail.channel')
        .getRawMany<{ channel: string; pending: string; oldest: Date | string | null }>(),
      this.detailRepository
        .createQueryBuilder('detail')
        .select('detail.channel', 'channel')
        .addSelect('detail.status', 'status')
        .addSelect("date_trunc('minute', detail.last_attempt_at)", 'minute')
        .addSelect('COUNT(*)', 'count')
        .where("detail.status IN ('sent', 'failed')")
        .andWhere('detail.last_attempt_at >= :since', { since })
        .groupBy('detail.channel')
        .addGroupBy('detail.status')
        .addGroupBy('minute')
        .getRawMany<{ channel: string; status: string; minute: Date | string; count: string }>(),
    ])

    const channels = new Set<string>(DEFAULT_MESSAGE_CHANNELS)
    pendingRows.forEach((row) => channels.add(row.channel))
    finishedRows.forEach((row) => channels.add(row.channel))

    const firstMinute = minuteOf(since.getTime())
    const window = MONITORING_THRESHOLDS.rateWindowMinutes

    return [...channels].map((channel) => {
      const sent = Array<number>(MONITORING_WINDOW_MINUTES).fill(0)
      const failed = Array<number>(MONITORING_WINDOW_MINUTES).fill(0)
      for (const row of finishedRows) {
        if (row.channel !== channel) continue
        const index = minuteOf(new Date(row.minute).getTime()) - firstMinute
        if (index < 0 || index >= MONITORING_WINDOW_MINUTES) continue
        const series = row.status === 'sent' ? sent : failed
        series[index] += Number(row.count) || 0
      }

      const pendingRow = pendingRows.find((row) => row.channel === channel)
      const pending = Number(pendingRow?.pending ?? 0) || 0
      const oldest = pendingRow?.oldest ? new Date(pendingRow.oldest).getTime() : null
      const sentPerMinute = averageOfWholeMinutes(sent, window)
      const failedPerMinute = averageOfWholeMinutes(failed, window)
      const finishedPerMinute = sentPerMinute + failedPerMinute

      return {
        channel,
        pending,
        oldestPendingAgeMs: pending > 0 && oldest !== null ? Math.max(0, now - oldest) : null,
        sent,
        failed,
        sentPerMinute,
        failedPerMinute,
        estimatedClearMinutes:
          pending === 0 ? 0 : finishedPerMinute > 0 ? Math.ceil(pending / finishedPerMinute) : null,
      }
    })
  }
}
