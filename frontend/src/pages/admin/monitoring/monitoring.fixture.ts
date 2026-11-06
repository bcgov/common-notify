import type { QueueMonitoring as QueueMonitoringData } from '@/interfaces/queueMonitoring.interface'

export const MB = 1024 * 1024
export const generatedAt = '2026-10-01T18:00:00.000Z'
export const now = new Date(generatedAt).getTime()

const series = (value: number) => new Array<number>(60).fill(value)

/** A healthy snapshot with one of everything, for the monitoring page specs. */
export function snapshot(overrides: Partial<QueueMonitoringData> = {}): QueueMonitoringData {
  return {
    generatedAt,
    status: 'healthy',
    overview: {
      windowMinutes: 60,
      deliveryTime: { medianMs: 42_000, p95Ms: 130_000, messages: 1240 },
      messagesSent: 1240,
      messagesFailed: 8,
      sendingRate: { perMinute: 36.1, messages: 1180, busySeconds: 1962 },
      failurePercent: 0.6,
      requestsReceived: 38,
    },
    redis: {
      status: 'healthy',
      reasons: [],
      usedMemoryBytes: 300 * MB,
      peakMemoryBytes: 400 * MB,
      maxMemoryBytes: 768 * MB,
      usedMemoryPercent: 39.1,
      maxMemoryPolicy: 'noeviction',
      fragmentationRatio: 1.12,
      evictedKeys: 0,
      rejectedConnections: 0,
      connectedClients: 12,
      blockedClients: 4,
      opsPerSecond: 250,
      uptimeSeconds: 7200,
      version: '7.2.4',
    },
    messages: [
      {
        channel: 'EMAIL',
        pending: 63,
        oldestPendingAgeMs: 50_000,
        sent: series(1),
        failed: series(0),
        sentPerMinute: 21,
        failedPerMinute: 0,
        estimatedClearMinutes: 3,
      },
      {
        channel: 'SMS',
        pending: 0,
        oldestPendingAgeMs: null,
        sent: series(0),
        failed: series(0),
        sentPerMinute: 0,
        failedPerMinute: 0,
        estimatedClearMinutes: 0,
      },
    ],
    sendsInProgress: [
      {
        notificationId: 'req-1',
        tenantId: 't-1',
        tenantName: 'Health Ministry',
        channels: ['EMAIL'],
        acceptedAt: new Date(now - 300_000).toISOString(),
        total: 2000,
        sent: 398,
        failed: 2,
        remaining: 1600,
        batches: 80,
        batchesDone: 16,
        batchesSending: 20,
        perMinute: 64,
        estimatedMinutesLeft: 25,
      },
    ],
    queues: [
      {
        name: 'email-delivery',
        status: 'healthy',
        reasons: [],
        isPaused: false,
        counts: { waiting: 120, active: 2, delayed: 3, failed: 1, paused: 0 },
        oldestWaitingAgeMs: 45_000,
        throughput: {
          added: series(10),
          completed: series(30),
          failed: series(0),
          inPerMinute: 10,
          outPerMinute: 30,
          failureRatePercent: 0,
        },
        estimatedDrainMinutes: 6,
        liveWorkerPods: 1,
        unheldActiveJobs: 0,
      },
    ],
    workers: [
      {
        podId: 'notify-backend-abc12',
        startedAt: new Date(now - 3_600_000).toISOString(),
        lastHeartbeatAt: new Date(now - 4_000).toISOString(),
        draining: false,
        queues: [
          {
            queue: 'email-delivery',
            concurrency: 2,
            active: 2,
            completed: 900,
            failed: 1,
            lastFinishedAt: new Date(now - 2_000).toISOString(),
          },
        ],
      },
    ],
    providers: [
      {
        name: 'CHES',
        channel: 'EMAIL',
        status: 'healthy',
        reasons: [],
        circuit: 'closed',
        reopensAt: null,
        inFlight: 3,
        limit: 5,
      },
      {
        name: 'ACS',
        channel: 'SMS',
        status: 'healthy',
        reasons: [],
        circuit: 'closed',
        reopensAt: null,
        inFlight: null,
        limit: null,
      },
    ],
    reconciler: {
      status: 'healthy',
      reasons: [],
      lastPassAt: new Date(now - 20_000).toISOString(),
      intervalMs: 60_000,
      lastPassDurationMs: 35,
      lastPassFound: 4,
      windowMinutes: 60,
      retried: 1,
      requeued: 3,
      gaveUp: 0,
      recentActions: [
        {
          at: new Date(now - 120_000).toISOString(),
          kind: 'scheduled',
          action: 'requeued',
          jobId: 'notif-90',
          notificationId: 'notif-90',
          tenantId: 't-1',
          tenantName: 'Health Ministry',
        },
      ],
    },
    recentFailures: [
      {
        queue: 'email-delivery',
        jobId: '77',
        notificationId: 'notif-77',
        tenantId: 't-1',
        tenantName: 'Health Ministry',
        reason: 'CHES rejected [email]',
        attemptsMade: 3,
        failedAt: new Date(now - 60_000).toISOString(),
      },
    ],
    ...overrides,
  }
}
