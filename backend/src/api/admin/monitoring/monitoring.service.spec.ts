import { describe, it, expect, vi } from 'vitest'
import { ServiceUnavailableException } from '@nestjs/common'
import type Bull from 'bull'
import type Redis from 'ioredis'
import type { Repository } from 'typeorm'
import {
  MonitoringService,
  averageOfWholeMinutes,
  buildOverview,
  buildRedisStats,
  buildReconcilerStats,
  sendingRateFrom,
  countUnheldActiveJobs,
  evaluateQueue,
  maskPersonalData,
  parseRedisInfo,
  worstStatus,
} from './monitoring.service'
import { MONITORING_WINDOW_MINUTES } from '../../../queue/queue-metrics'
import type { Tenant } from '../tenants/entities/tenant.entity'
import type { NotificationRequestDetail } from '../../notification/entities/notification-request-detail.entity'

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
  unheldActiveJobs: 0,
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

describe('countUnheldActiveJobs', () => {
  const now = 1_000_000
  const pod = (active: number) => ({
    podId: 'pod',
    startedAt: '',
    lastHeartbeatAt: '',
    queues: [
      {
        queue: 'email-delivery',
        concurrency: 2,
        active,
        completed: 0,
        failed: 0,
        lastFinishedAt: null,
      },
    ],
  })
  const job = (ageMs: number) => ({ processedOn: now - ageMs }) as unknown as Bull.Job

  it('is zero when live workers report holding every active job', () => {
    expect(countUnheldActiveJobs('email-delivery', [job(60_000)], [pod(1)], now)).toBe(0)
  })

  it('counts settled active jobs that no live worker holds', () => {
    expect(countUnheldActiveJobs('email-delivery', [job(60_000), job(90_000)], [pod(1)], now)).toBe(
      1,
    )
    expect(countUnheldActiveJobs('email-delivery', [job(60_000)], [], now)).toBe(1)
  })

  it('allows for heartbeat lag on jobs that only just started', () => {
    expect(countUnheldActiveJobs('email-delivery', [job(5_000)], [pod(0)], now)).toBe(0)
  })

  it('warns on the queue when a job looks stalled', () => {
    const queue = evaluateQueue({ ...baseQueue, unheldActiveJobs: 1 })
    expect(queue.status).toBe('warning')
    expect(queue.reasons[0]).toMatch(/not held by any live worker/)
  })
})

describe('sendingRateFrom', () => {
  it('scales busy sending up to a per-minute rate', () => {
    // 20 messages over 30 seconds of sending is a 40/min pace.
    expect(sendingRateFrom(20, 30)).toEqual({ perMinute: 40, messages: 20, busySeconds: 30 })
  })

  it('is null when there is too little sending to extrapolate from', () => {
    expect(sendingRateFrom(9, 60)).toBeNull()
    expect(sendingRateFrom(50, 4)).toBeNull()
    expect(sendingRateFrom(0, 0)).toBeNull()
  })
})

describe('buildOverview', () => {
  const channel = (sent: number, failed: number) => ({
    channel: 'EMAIL',
    pending: 0,
    oldestPendingAgeMs: null,
    sent: [...Array<number>(59).fill(0), sent],
    failed: [...Array<number>(59).fill(0), failed],
    sentPerMinute: 0,
    failedPerMinute: 0,
    estimatedClearMinutes: 0,
  })

  it('totals the hour across channels and counts requests from ingestion adds', () => {
    const ingestion = {
      ...baseQueue,
      name: 'notification-ingestion',
      throughput: { ...baseQueue.throughput, added: [...Array<number>(59).fill(0), 38] },
    }
    const overview = buildOverview(
      [channel(1200, 6), { ...channel(40, 2), channel: 'SMS' }],
      [evaluateQueue(ingestion)],
      null,
      null,
    )

    expect(overview).toMatchObject({
      windowMinutes: 60,
      messagesSent: 1240,
      messagesFailed: 8,
      sendingRate: null,
      failurePercent: 0.6,
      requestsReceived: 38,
    })
  })

  it('reports a zero failure rate when nothing finished', () => {
    expect(buildOverview([channel(0, 0)], [], null, null).failurePercent).toBe(0)
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
      getActive: vi.fn().mockResolvedValue([]),
      client: {
        lindex: vi.fn().mockResolvedValue('job-1'),
        mget: vi.fn((...keys: string[]) => Promise.resolve(keys.map(() => null))),
      },
      ...overrides,
    } as unknown as Bull.Queue
  }

  /** Reconcile activity as the pipeline returns it: last pass, recent actions, then minute counts. */
  function fakeReconcilePipeline(
    lastPass: object | null = null,
    recent: object[] = [],
    lastMinuteCounts: Record<string, string> = {},
  ) {
    const minutes = Array.from({ length: MONITORING_WINDOW_MINUTES }, (_, i) =>
      i === MONITORING_WINDOW_MINUTES - 1 ? lastMinuteCounts : {},
    )
    const pipeline: Record<string, unknown> = {}
    for (const method of ['get', 'lrange', 'hgetall']) pipeline[method] = vi.fn(() => pipeline)
    pipeline.exec = vi
      .fn()
      .mockResolvedValue(
        [
          lastPass && JSON.stringify(lastPass),
          recent.map((action) => JSON.stringify(action)),
          ...minutes,
        ].map((value) => [null, value]),
      )
    return pipeline
  }

  function fakeRedis(workers: object[] = [], pipeline = fakeReconcilePipeline()) {
    return {
      pipeline: vi.fn(() => pipeline),
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

  /** Query builders resolve in creation order: pending, finished, then delivery time. */
  function fakeDetailRepository(
    pendingRows: object[] = [],
    finishedRows: object[] = [],
    deliveryRow: object = { median: null, p95: null, messages: '0' },
    rateRow: object = { busy_messages: '0', busy_seconds: '0' },
  ) {
    const results: unknown[] = [pendingRows, finishedRows, deliveryRow]
    return {
      metadata: { tablePath: 'notify.notification_request_detail' },
      query: vi.fn().mockResolvedValue([rateRow]),
      createQueryBuilder: vi.fn(() => {
        const rows = results.shift() ?? []
        const builder: Record<string, unknown> = {}
        for (const method of [
          'innerJoin',
          'select',
          'addSelect',
          'where',
          'andWhere',
          'groupBy',
          'addGroupBy',
        ]) {
          builder[method] = vi.fn(() => builder)
        }
        builder.getRawMany = vi.fn().mockResolvedValue(rows)
        builder.getRawOne = vi.fn().mockResolvedValue(rows)
        return builder
      }),
    } as unknown as Repository<NotificationRequestDetail>
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
      fakeDetailRepository(),
    )

    const result = await service.getQueueMonitoring()

    expect(result.redis.usedMemoryPercent).toBe(10)
    expect(result.queues).toHaveLength(1)
    expect(result.queues[0].liveWorkerPods).toBe(1)
    expect(result.queues[0].oldestWaitingAgeMs).toBeGreaterThanOrEqual(30_000)
    expect(result.workers[0].podId).toBe('pod-0')
    // Heartbeats from a build that predates draining carry no flag.
    expect(result.workers[0].draining).toBe(false)
    expect(result.status).toBe('healthy')
  })

  it('reports what the delivery reconciler recovered, with tenant names', async () => {
    const pipeline = fakeReconcilePipeline(
      { at: now - 20_000, durationMs: 40, intervalMs: 60_000, found: 3, outcomes: { requeued: 1 } },
      [
        {
          at: now - 20_000,
          kind: 'batch',
          action: 'gave-up',
          jobId: 'n-1-EMAIL-0',
          notifyId: 'n-1',
          tenantId: 't-1',
        },
      ],
      { requeued: '2', 'gave-up': '1' },
    )
    const service = new MonitoringService(
      fakeRedis([livePod], pipeline),
      null,
      fakeQueue('email-delivery'),
      null,
      null,
      tenantRepository,
      fakeDetailRepository(),
    )

    const result = await service.getQueueMonitoring()

    expect(result.reconciler).toMatchObject({
      lastPassFound: 3,
      requeued: 2,
      gaveUp: 1,
      retried: 0,
      status: 'warning',
    })
    expect(result.reconciler.recentActions[0]).toMatchObject({
      notificationId: 'n-1',
      tenantName: 'Health Ministry',
    })
    // A give-up is surfaced in the page's overall status, not only on its own panel.
    expect(result.status).toBe('warning')
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
      fakeDetailRepository(),
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
      fakeDetailRepository(),
    )

    const { workers } = await service.getQueueMonitoring()
    expect(workers.map((worker) => worker.podId)).toEqual(['pod-0'])
  })

  it('counts pending recipients and per-minute sends by channel', async () => {
    const minuteStart = (offsetMinutes: number) =>
      new Date((Math.floor(now / 60_000) - offsetMinutes) * 60_000)
    const service = new MonitoringService(
      fakeRedis([livePod]),
      null,
      fakeQueue('email-delivery'),
      null,
      null,
      tenantRepository,
      fakeDetailRepository(
        [{ channel: 'EMAIL', pending: '60', oldest: new Date(now - 90_000) }],
        [
          { channel: 'EMAIL', status: 'sent', minute: minuteStart(1), count: '20' },
          { channel: 'EMAIL', status: 'failed', minute: minuteStart(1), count: '5' },
          { channel: 'EMAIL', status: 'sent', minute: minuteStart(0), count: '7' },
          // Outside the hour: ignored rather than written past the end of the series.
          { channel: 'EMAIL', status: 'sent', minute: minuteStart(90), count: '999' },
        ],
      ),
    )

    const { messages } = await service.getQueueMonitoring()
    const email = messages.find((m) => m.channel === 'EMAIL')!
    const sms = messages.find((m) => m.channel === 'SMS')!

    expect(email.pending).toBe(60)
    expect(email.oldestPendingAgeMs).toBeGreaterThanOrEqual(90_000)
    expect(email.sent.at(-1)).toBe(7)
    expect(email.sent.at(-2)).toBe(20)
    expect(email.failed.at(-2)).toBe(5)
    expect(email.sent.reduce((a, b) => a + b, 0)).toBe(27)
    // 25 finished in the one busy minute of the last five -> 5/min -> 60 pending clears in 12.
    expect(email.sentPerMinute).toBe(4)
    expect(email.failedPerMinute).toBe(1)
    expect(email.estimatedClearMinutes).toBe(12)
    expect(sms).toMatchObject({ pending: 0, oldestPendingAgeMs: null, estimatedClearMinutes: 0 })
  })

  it('reports progress for active merge batches and ignores other active jobs', async () => {
    const batch = {
      id: 'req-1-EMAIL-0',
      processedOn: now - 20_000,
      data: { notifyId: 'req-1', tenantId: 't-1', mailMergeData: { recipients: ['secret'] } },
      progress: () => ({ sent: 37, failed: 2, total: 100 }),
    }
    const single = { id: '9', processedOn: now, data: {}, progress: () => 0 }
    const queue = fakeQueue('email-delivery', {
      getActive: vi.fn().mockResolvedValue([batch, single]),
    })
    const service = new MonitoringService(
      fakeRedis([livePod]),
      null,
      queue,
      null,
      null,
      tenantRepository,
      fakeDetailRepository(),
    )

    const { activeBatches } = await service.getQueueMonitoring()

    expect(activeBatches).toEqual([
      {
        queue: 'email-delivery',
        jobId: 'req-1-EMAIL-0',
        notificationId: 'req-1',
        tenantId: 't-1',
        tenantName: 'Health Ministry',
        sent: 37,
        failed: 2,
        total: 100,
        startedAt: new Date(now - 20_000).toISOString(),
      },
    ])
  })

  it('reports delivery time percentiles for the last hour', async () => {
    const service = new MonitoringService(
      fakeRedis([livePod]),
      null,
      fakeQueue('email-delivery'),
      null,
      null,
      tenantRepository,
      fakeDetailRepository([], [], { median: '42000.4', p95: '130000', messages: '1240' }),
    )

    const { overview } = await service.getQueueMonitoring()

    expect(overview.deliveryTime).toEqual({ medianMs: 42000, p95Ms: 130000, messages: 1240 })
  })

  it('reports the sustained sending speed from busy time', async () => {
    const service = new MonitoringService(
      fakeRedis([livePod]),
      null,
      fakeQueue('email-delivery'),
      null,
      null,
      tenantRepository,
      fakeDetailRepository([], [], undefined, { busy_messages: '28', busy_seconds: '46.5' }),
    )

    const { overview } = await service.getQueueMonitoring()

    expect(overview.sendingRate).toEqual({ perMinute: 36.1, messages: 28, busySeconds: 47 })
  })

  it('reports no delivery time when nothing was sent in the last hour', async () => {
    const service = new MonitoringService(
      fakeRedis([livePod]),
      null,
      fakeQueue('email-delivery'),
      null,
      null,
      tenantRepository,
      fakeDetailRepository(),
    )

    expect((await service.getQueueMonitoring()).overview.deliveryTime).toBeNull()
  })

  it('is unavailable when Redis is not configured', async () => {
    const service = new MonitoringService(
      null,
      null,
      null,
      null,
      null,
      tenantRepository,
      fakeDetailRepository(),
    )
    await expect(service.getQueueMonitoring()).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})

describe('buildReconcilerStats', () => {
  const now = Date.parse('2026-10-05T12:00:00Z')
  const counts = { retried: 0, requeued: 0, 'gave-up': 0 }
  const pass = (ageMs: number) => ({
    at: now - ageMs,
    durationMs: 12,
    intervalMs: 60_000,
    found: 0,
    outcomes: {},
  })

  it('is healthy when passes are running and nothing was given up', () => {
    const stats = buildReconcilerStats(
      { lastPass: pass(30_000), counts, recent: [] },
      now,
      new Map(),
    )
    expect(stats.status).toBe('healthy')
    expect(stats.reasons).toEqual([])
    expect(stats.lastPassAt).toBe('2026-10-05T11:59:30.000Z')
  })

  it('warns when the reconciler has missed several passes', () => {
    const stats = buildReconcilerStats(
      { lastPass: pass(5 * 60_000), counts, recent: [] },
      now,
      new Map(),
    )
    expect(stats.status).toBe('warning')
    expect(stats.reasons[0]).toMatch(/Has not run for 5 min/)
  })

  it('treats no recorded pass as not yet run rather than a fault', () => {
    const stats = buildReconcilerStats({ lastPass: null, counts, recent: [] }, now, new Map())
    expect(stats.status).toBe('healthy')
    expect(stats.lastPassAt).toBeNull()
    expect(stats.intervalMs).toBeNull()
  })

  it('warns when work was given up on', () => {
    const stats = buildReconcilerStats(
      { lastPass: pass(1_000), counts: { ...counts, 'gave-up': 2 }, recent: [] },
      now,
      new Map(),
    )
    expect(stats.status).toBe('warning')
    expect(stats.reasons[0]).toMatch(/Gave up on 2 stuck send/)
  })
})
