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
  /** Active jobs no live worker reports holding: likely stalled after a pod died. */
  unheldActiveJobs: number
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
  /** Shutting down: finishing the jobs it holds, taking no new ones. */
  draining: boolean
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

/**
 * Individual recipients for one channel, counted from notification_request_detail. A merge
 * batch is one job but up to BATCH_SIZE messages, so job counts alone understate the backlog.
 */
export interface MessageChannelStatsDto {
  channel: string
  /** Recipients accepted in the last 24 hours and not yet sent or failed; scheduled sends excluded. */
  pending: number
  oldestPendingAgeMs: number | null
  /** Per-minute counts, oldest first; the last entry is the current, partial minute. */
  sent: number[]
  failed: number[]
  sentPerMinute: number
  failedPerMinute: number
  /** Minutes until pending reaches zero at the current send rate; null when nothing is sending. */
  estimatedClearMinutes: number | null
}

export interface ActiveBatchDto {
  queue: string
  jobId: string
  notificationId: string | null
  tenantId: string | null
  tenantName: string | null
  sent: number
  failed: number
  total: number
  startedAt: string | null
}

/** Totals over the last hour, for the summary cards. */
export interface MonitoringOverviewDto {
  windowMinutes: number
  /** From the request being accepted (or a scheduled send falling due) to the provider accepting the message. */
  deliveryTime: { medianMs: number; p95Ms: number; messages: number } | null
  messagesSent: number
  messagesFailed: number
  /**
   * Sustained sending speed: messages sent while busy, divided by time spent busy, as a
   * per-minute rate. Gaps between sends longer than an idle threshold are not counted as busy.
   * Null when there was too little sending to estimate from.
   */
  sendingRate: { perMinute: number; messages: number; busySeconds: number } | null
  failurePercent: number
  /** Notification requests accepted: one ingestion job each. */
  requestsReceived: number
}

export interface ReconcilerActionDto {
  at: string
  /** What was owed: pending, ingestion, scheduled, batch or delivery. */
  kind: string
  action: 'retried' | 'requeued' | 'gave-up'
  jobId: string
  notificationId: string
  tenantId: string
  tenantName: string | null
}

/** The delivery reconciler: when it last ran and what it recovered. */
export interface ReconcilerStatsDto {
  status: HealthStatus
  reasons: string[]
  lastPassAt: string | null
  intervalMs: number | null
  lastPassDurationMs: number | null
  /** Work items the last pass checked, including those whose job was still running. */
  lastPassFound: number | null
  windowMinutes: number
  retried: number
  requeued: number
  gaveUp: number
  recentActions: ReconcilerActionDto[]
}

export interface QueueMonitoringResponseDto {
  generatedAt: string
  status: HealthStatus
  overview: MonitoringOverviewDto
  redis: RedisStatsDto
  messages: MessageChannelStatsDto[]
  queues: QueueStatsDto[]
  activeBatches: ActiveBatchDto[]
  workers: WorkerPodDto[]
  reconciler: ReconcilerStatsDto
  recentFailures: RecentFailureDto[]
}
