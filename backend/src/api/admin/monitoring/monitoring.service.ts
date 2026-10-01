import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import type Bull from 'bull'
import type Redis from 'ioredis'
import { QueueName } from '../../../enum/queue-name.enum'
import { ProviderToken } from '../../../enum/provider-token.enum'
import { Tenant } from '../tenants/entities/tenant.entity'
import {
  MONITORING_WINDOW_MINUTES,
  addedCounterKey,
  alignBullMetrics,
  bullKey,
  minuteOf,
} from '../../../queue/queue-metrics'
import type { BullMetrics } from '../../../queue/queue-metrics'
import {
  HEARTBEAT_TTL_SECONDS,
  WORKER_INDEX_KEY,
  workerHeartbeatKey,
} from '../../../queue/worker-heartbeat'
import type { WorkerHeartbeatPayload } from '../../../queue/worker-heartbeat'
import { MONITORING_THRESHOLDS } from './monitoring-thresholds'
import type {
  HealthStatus,
  QueueMonitoringResponseDto,
  QueueStatsDto,
  RecentFailureDto,
  RedisStatsDto,
  WorkerPodDto,
} from './schemas/queue-monitoring.dto'

const FAILURES_PER_QUEUE = 10
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

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

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
    const [info, workers] = await Promise.all([this.redis.info(), this.getWorkers(now)])
    const redis = buildRedisStats(parseRedisInfo(info))
    const queues = await Promise.all(
      this.queues.map((queue) => this.getQueueStats(queue, workers, now)),
    )
    const recentFailures = await this.getRecentFailures()

    return {
      generatedAt: new Date(now).toISOString(),
      status: worstStatus([redis.status, ...queues.map((queue) => queue.status)]),
      redis,
      queues,
      workers,
      recentFailures,
    }
  }

  private async getQueueStats(
    queue: Bull.Queue,
    workers: WorkerPodDto[],
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

  private async getRecentFailures(): Promise<RecentFailureDto[]> {
    const perQueue = await Promise.all(
      this.queues.map(async (queue) => {
        const jobs = await queue.getFailed(0, FAILURES_PER_QUEUE - 1)
        return jobs.filter(Boolean).map((job) => ({ queue: queue.name, job }))
      }),
    )

    const failures = perQueue
      .flat()
      .sort((a, b) => (b.job.finishedOn ?? 0) - (a.job.finishedOn ?? 0))
      .slice(0, RECENT_FAILURES_LIMIT)

    const tenantIds = [
      ...new Set(
        failures
          .map(({ job }) => asString((job.data as JobIdentifiers)?.tenantId))
          .filter((id): id is string => !!id),
      ),
    ]
    const tenants = tenantIds.length
      ? await this.tenantRepository.find({
          where: { id: In(tenantIds) },
          select: { id: true, name: true },
        })
      : []
    const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]))

    return failures.map(({ queue, job }) => {
      const data = (job.data ?? {}) as JobIdentifiers
      const tenantId = asString(data.tenantId)
      return {
        queue,
        jobId: String(job.id),
        notificationId: asString(data.notifyId) ?? asString(data.notificationId),
        tenantId,
        tenantName: tenantId ? (tenantNames.get(tenantId) ?? null) : null,
        reason: maskPersonalData(job.failedReason ?? 'No reason recorded'),
        attemptsMade: job.attemptsMade,
        failedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      }
    })
  }
}
