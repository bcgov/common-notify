/**
 * Response shape for GET /api/v1/frontend/admin/monitoring/queues.
 * Mirrored by frontend/src/interfaces/queueMonitoring.interface.ts.
 */

export type HealthStatus = 'healthy' | 'warning' | 'critical'

export interface StatusReason {
  status: HealthStatus
  /** Plain-language reason shown next to the badge; empty when healthy. */
  reasons: string[]
}

export interface RedisStatsDto extends StatusReason {
  usedMemoryBytes: number
  peakMemoryBytes: number
  /** Null when Redis has no memory cap configured. */
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

export interface QueueCountsDto {
  waiting: number
  active: number
  delayed: number
  failed: number
  paused: number
}

export interface QueueThroughputDto {
  /** Per-minute counts, oldest first; the last entry is the current, partial minute. */
  added: number[]
  completed: number[]
  failed: number[]
  /** Averages over the last few whole minutes. */
  inPerMinute: number
  outPerMinute: number
  failureRatePercent: number
}

export interface QueueStatsDto extends StatusReason {
  name: string
  isPaused: boolean
  counts: QueueCountsDto
  /** Age of the job that has waited longest, or null when nothing is waiting. */
  oldestWaitingAgeMs: number | null
  throughput: QueueThroughputDto
  /** Minutes until the backlog clears at the current rates; null when it is not shrinking. */
  estimatedDrainMinutes: number | null
  liveWorkerPods: number
}

export interface WorkerQueueDto {
  queue: string
  concurrency: number
  active: number
  completed: number
  failed: number
  lastFinishedAt: string | null
}

export interface WorkerPodDto {
  podId: string
  startedAt: string
  lastHeartbeatAt: string
  queues: WorkerQueueDto[]
}

export interface RecentFailureDto {
  queue: string
  jobId: string
  notificationId: string | null
  tenantId: string | null
  tenantName: string | null
  /** Bull's failure reason with email addresses and phone numbers masked. */
  reason: string
  attemptsMade: number
  failedAt: string | null
}

export interface QueueMonitoringResponseDto {
  generatedAt: string
  status: HealthStatus
  redis: RedisStatsDto
  queues: QueueStatsDto[]
  workers: WorkerPodDto[]
  recentFailures: RecentFailureDto[]
}
