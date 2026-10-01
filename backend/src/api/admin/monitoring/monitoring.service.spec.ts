import { describe, it, expect, vi } from 'vitest'
import { ServiceUnavailableException } from '@nestjs/common'
import type Bull from 'bull'
import type Redis from 'ioredis'
import type { Repository } from 'typeorm'
import {
  MonitoringService,
  averageOfWholeMinutes,
  buildRedisStats,
  evaluateQueue,
  maskPersonalData,
  parseRedisInfo,
  worstStatus,
} from './monitoring.service'
import { MONITORING_WINDOW_MINUTES } from '../../../queue/queue-metrics'
import type { Tenant } from '../tenants/entities/tenant.entity'

const MB = 1024 * 1024

const healthyInfo = (overrides: Record<string, string | number> = {}) =>
  parseRedisInfo(
    Object.entries({
      redis_version: '7.2.4',
      used_memory: 300 * MB,
      used_memory_peak: 400 * MB,
      maxmemory: 768 * MB,
      maxmemory_policy: 'noeviction',
      mem_fragmentation_ratio: '1.12',
      evicted_keys: 0,
      rejected_connections: 0,
      connected_clients: 12,
      blocked_clients: 4,
      instantaneous_ops_per_sec: 250,
      uptime_in_seconds: 3600,
      ...overrides,
    })
      .map(([key, value]) => `${key}:${value}`)
      .join('\r\n'),
  )

const series = (wholeMinuteValue: number, current = 0) => [
  ...Array<number>(MONITORING_WINDOW_MINUTES - 1).fill(wholeMinuteValue),
  current,
]

const baseQueue = {
  name: 'email-delivery',
  isPaused: false,
  counts: { waiting: 0, active: 0, delayed: 0, failed: 0, paused: 0 },
  oldestWaitingAgeMs: null,
  throughput: {
    added: series(10),
    completed: series(10),
    failed: series(0),
    inPerMinute: 10,
    outPerMinute: 10,
    failureRatePercent: 0,
  },
  liveWorkerPods: 2,
}

describe('parseRedisInfo', () => {
  it('reads field:value lines and skips section headers', () => {
    expect(
      parseRedisInfo('# Memory\r\nused_memory:1024\r\nmaxmemory_policy:noeviction\r\n'),
    ).toEqual({ used_memory: '1024', maxmemory_policy: 'noeviction' })
  })
})

describe('buildRedisStats', () => {
  it('is healthy below the warning threshold', () => {
    const stats = buildRedisStats(healthyInfo())
    expect(stats.status).toBe('healthy')
    expect(stats.usedMemoryPercent).toBe(39.1)
    expect(stats.reasons).toEqual([])
  })

  it('warns at 70% of the memory cap and is critical at 85%', () => {
    expect(buildRedisStats(healthyInfo({ used_memory: 560 * MB })).status).toBe('warning')
    expect(buildRedisStats(healthyInfo({ used_memory: 660 * MB })).status).toBe('critical')
  })

  it('is critical when Redis could evict Bull keys', () => {
    const stats = buildRedisStats(healthyInfo({ maxmemory_policy: 'allkeys-lru', evicted_keys: 3 }))
    expect(stats.status).toBe('critical')
    expect(stats.reasons).toHaveLength(2)
  })

  it('reports no percentage when Redis has no memory cap', () => {
    const stats = buildRedisStats(healthyInfo({ maxmemory: 0 }))
    expect(stats.maxMemoryBytes).toBeNull()
    expect(stats.usedMemoryPercent).toBeNull()
    expect(stats.status).toBe('healthy')
  })
})

describe('evaluateQueue', () => {
  it('is healthy with an empty backlog and estimates no drain time', () => {
    const queue = evaluateQueue(baseQueue)
    expect(queue.status).toBe('healthy')
    expect(queue.estimatedDrainMinutes).toBe(0)
  })

  it('estimates drain time from the gap between in and out rates', () => {
    const queue = evaluateQueue({
      ...baseQueue,
      counts: { ...baseQueue.counts, waiting: 100 },
      throughput: { ...baseQueue.throughput, inPerMinute: 10, outPerMinute: 30 },
    })
    expect(queue.estimatedDrainMinutes).toBe(5)
  })

  it('warns when jobs arrive faster than they finish', () => {
    const queue = evaluateQueue({
      ...baseQueue,
      counts: { ...baseQueue.counts, waiting: 100 },
      throughput: { ...baseQueue.throughput, inPerMinute: 30, outPerMinute: 10 },
    })
    expect(queue.status).toBe('warning')
    expect(queue.estimatedDrainMinutes).toBeNull()
  })

  it('is critical when jobs are waiting and no pod is processing the queue', () => {
    const queue = evaluateQueue({
      ...baseQueue,
      counts: { ...baseQueue.counts, waiting: 5 },
      liveWorkerPods: 0,
    })
    expect(queue.status).toBe('critical')
  })

  it('grades the oldest waiting job against both thresholds', () => {
    const waiting = { ...baseQueue.counts, waiting: 1 }
    expect(
      evaluateQueue({ ...baseQueue, counts: waiting, oldestWaitingAgeMs: 3 * 60_000 }).status,
    ).toBe('warning')
    expect(
      evaluateQueue({ ...baseQueue, counts: waiting, oldestWaitingAgeMs: 11 * 60_000 }).status,
    ).toBe('critical')
  })

  it('ignores the failure rate until enough jobs have finished', () => {
    const throughput = { ...baseQueue.throughput, outPerMinute: 0.2, failureRatePercent: 100 }
    expect(evaluateQueue({ ...baseQueue, throughput }).status).toBe('healthy')
  })

  it('flags a high failure rate once there is enough volume', () => {
    const throughput = { ...baseQueue.throughput, outPerMinute: 10, failureRatePercent: 30 }
    expect(evaluateQueue({ ...baseQueue, throughput }).status).toBe('critical')
  })

  it('warns when the queue is paused', () => {
    expect(evaluateQueue({ ...baseQueue, isPaused: true }).reasons).toContain('Queue is paused')
  })
})

describe('helpers', () => {
  it('averages whole minutes and leaves out the current partial minute', () => {
    expect(averageOfWholeMinutes([1, 2, 4, 6, 8, 10, 999], 5)).toBe(6)
  })

  it('picks the worst status', () => {
    expect(worstStatus(['healthy', 'critical', 'warning'])).toBe('critical')
    expect(worstStatus([])).toBe('healthy')
  })

  it('masks email addresses and phone numbers in failure reasons', () => {
    expect(
      maskPersonalData('Invalid recipient jane.doe@gov.bc.ca, sms +1 (250) 555-0123 rejected'),
    ).toBe('Invalid recipient [email], sms [phone] rejected')
  })
})

describe('MonitoringService', () => {
  const now = Date.now()

  function fakeQueue(name: string, overrides: Partial<Record<string, unknown>> = {}) {
    return {
      name,
      getJobCounts: vi.fn().mockResolvedValue({
        waiting: 2,
        active: 1,
        completed: 50,
        failed: 1,
        delayed: 0,
        paused: 0,
      }),
      isPaused: vi.fn().mockResolvedValue(false),
      getMetrics: vi.fn().mockResolvedValue({
        meta: { count: 0, prevTS: 0, prevCount: 0 },
        data: [],
        count: 0,
      }),
      getJob: vi.fn().mockResolvedValue({ timestamp: now - 30_000, opts: {} }),
      getFailed: vi.fn().mockResolvedValue([]),
      client: {
        lindex: vi.fn().mockResolvedValue('job-1'),
        mget: vi.fn((...keys: string[]) => Promise.resolve(keys.map(() => null))),
      },
      ...overrides,
    } as unknown as Bull.Queue
  }

  function fakeRedis(workers: object[] = []) {
    return {
      info: vi
        .fn()
        .mockResolvedValue(
          'redis_version:7.2.4\r\nused_memory:1000\r\nmaxmemory:10000\r\nmaxmemory_policy:noeviction',
        ),
      zremrangebyscore: vi.fn().mockResolvedValue(0),
      zrange: vi.fn().mockResolvedValue(workers.map((_, i) => `pod-${i}`)),
      mget: vi.fn().mockResolvedValue(workers.map((worker) => JSON.stringify(worker))),
    } as unknown as Redis
  }

  const tenantRepository = {
    find: vi.fn().mockResolvedValue([{ id: 't-1', name: 'Health Ministry' }]),
  } as unknown as Repository<Tenant>

  const livePod = {
    podId: 'pod-0',
    startedAt: now - 60_000,
    heartbeatAt: now - 2_000,
    queues: [
      {
        queue: 'email-delivery',
        concurrency: 2,
        active: 1,
        completed: 40,
        failed: 1,
        lastFinishedAt: now - 1_000,
      },
    ],
  }

  it('reports Redis, every queue, live workers and the oldest waiting job', async () => {
    const service = new MonitoringService(
      fakeRedis([livePod]),
      null,
      fakeQueue('email-delivery'),
      null,
      null,
      tenantRepository,
    )

    const result = await service.getQueueMonitoring()

    expect(result.redis.usedMemoryPercent).toBe(10)
    expect(result.queues).toHaveLength(1)
    expect(result.queues[0].liveWorkerPods).toBe(1)
    expect(result.queues[0].oldestWaitingAgeMs).toBeGreaterThanOrEqual(30_000)
    expect(result.workers[0].podId).toBe('pod-0')
    expect(result.status).toBe('healthy')
  })

  it('returns recent failures newest first with tenant names and masked reasons', async () => {
    const failedJob = (id: string, finishedOn: number) => ({
      id,
      finishedOn,
      attemptsMade: 3,
      failedReason: 'CHES rejected bob@example.com',
      data: { notifyId: `n-${id}`, tenantId: 't-1', request: { secret: 'body' } },
    })
    const queue = fakeQueue('email-delivery', {
      getFailed: vi.fn().mockResolvedValue([failedJob('1', now - 5_000), failedJob('2', now)]),
    })
    const service = new MonitoringService(
      fakeRedis([livePod]),
      null,
      queue,
      null,
      null,
      tenantRepository,
    )

    const { recentFailures } = await service.getQueueMonitoring()

    expect(recentFailures.map((failure) => failure.jobId)).toEqual(['2', '1'])
    expect(recentFailures[0]).toEqual({
      queue: 'email-delivery',
      jobId: '2',
      notificationId: 'n-2',
      tenantId: 't-1',
      tenantName: 'Health Ministry',
      reason: 'CHES rejected [email]',
      attemptsMade: 3,
      failedAt: new Date(now).toISOString(),
    })
  })

  it('drops pods whose heartbeat key has expired', async () => {
    const redis = fakeRedis([livePod])
    ;(redis.zrange as ReturnType<typeof vi.fn>).mockResolvedValue(['pod-0', 'pod-gone'])
    ;(redis.mget as ReturnType<typeof vi.fn>).mockResolvedValue([JSON.stringify(livePod), null])
    const service = new MonitoringService(
      redis,
      null,
      fakeQueue('email-delivery'),
      null,
      null,
      tenantRepository,
    )

    const { workers } = await service.getQueueMonitoring()
    expect(workers.map((worker) => worker.podId)).toEqual(['pod-0'])
  })

  it('is unavailable when Redis is not configured', async () => {
    const service = new MonitoringService(null, null, null, null, null, tenantRepository)
    await expect(service.getQueueMonitoring()).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})
