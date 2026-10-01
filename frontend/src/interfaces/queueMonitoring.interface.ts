/**
 * Response of GET /api/v1/frontend/admin/monitoring/queues.
 * Mirrors backend/src/api/admin/monitoring/schemas/queue-monitoring.dto.ts.
 */

export type HealthStatus = 'healthy' | 'warning' | 'critical'

export interface RedisStats {
  status: HealthStatus
  reasons: string[]
  usedMemoryBytes: number
  peakMemoryBytes: number
  maxMemoryBytes: number | null
  usedMemoryPercent: number | null
  maxMemoryPolicy: string
  fragmentationRatio: number | null
  evictedKeys: number
  rejectedConnections: number
  connectedClients: number
  blockedClients: number
  opsPerSecond: number
  uptimeSeconds: number
  version: string
}

export interface QueueStats {
  name: string
  status: HealthStatus
  reasons: string[]
  isPaused: boolean
  counts: { waiting: number; active: number; delayed: number; failed: number; paused: number }
  oldestWaitingAgeMs: number | null
  throughput: {
    /** Per-minute counts, oldest first; the last entry is the current, partial minute. */
    added: number[]
    completed: number[]
    failed: number[]
    inPerMinute: number
    outPerMinute: number
    failureRatePercent: number
  }
  estimatedDrainMinutes: number | null
  liveWorkerPods: number
}

export interface WorkerPod {
  podId: string
  startedAt: string
  lastHeartbeatAt: string
  queues: Array<{
    queue: string
    concurrency: number
    active: number
    completed: number
    failed: number
    lastFinishedAt: string | null
  }>
}

export interface RecentFailure {
  queue: string
  jobId: string
  notificationId: string | null
  tenantId: string | null
  tenantName: string | null
  reason: string
  attemptsMade: number
  failedAt: string | null
}

export interface QueueMonitoring {
  generatedAt: string
  status: HealthStatus
  redis: RedisStats
  queues: QueueStats[]
  workers: WorkerPod[]
  recentFailures: RecentFailure[]
}
