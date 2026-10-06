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
  /** Active jobs no live worker reports holding: likely stalled after a pod died. */
  unheldActiveJobs: number
}

export interface WorkerPod {
  podId: string
  startedAt: string
  lastHeartbeatAt: string
  /** Shutting down: finishing the jobs it holds, taking no new ones. */
  draining: boolean
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

/** Individual recipients for one channel; a merge batch is one job but many messages. */
export interface MessageChannelStats {
  channel: string
  /** Accepted in the last 24 hours and not yet sent or failed; scheduled sends excluded. */
  pending: number
  oldestPendingAgeMs: number | null
  /** Per-minute counts, oldest first; the last entry is the current, partial minute. */
  sent: number[]
  failed: number[]
  sentPerMinute: number
  failedPerMinute: number
  estimatedClearMinutes: number | null
}

/**
 * One notification request with recipients still to send: a whole mail merge, however many
 * batches it was split into, or a plain send.
 */
export interface SendInProgress {
  notificationId: string
  tenantId: string
  tenantName: string | null
  channels: string[]
  acceptedAt: string
  total: number
  sent: number
  failed: number
  remaining: number
  /** Merge batches; 0 for a plain send. */
  batches: number
  batchesDone: number
  batchesSending: number
  /** Recipients sent or failed per minute over the last few minutes. */
  perMinute: number
  estimatedMinutesLeft: number | null
}

/** Totals over the last hour, for the summary cards. */
export interface MonitoringOverview {
  windowMinutes: number
  /** From the request being accepted (or a scheduled send falling due) to the provider accepting it. */
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
  requestsReceived: number
}

export type ReconcilerActionType = 'retried' | 'requeued' | 'gave-up'

export interface ReconcilerAction {
  at: string
  /** What was owed: pending, ingestion, scheduled, batch or delivery. */
  kind: string
  action: ReconcilerActionType
  jobId: string
  notificationId: string
  tenantId: string
  tenantName: string | null
}

/** The delivery reconciler: when it last ran and what it recovered. */
export interface ReconcilerStats {
  status: HealthStatus
  reasons: string[]
  lastPassAt: string | null
  intervalMs: number | null
  lastPassDurationMs: number | null
  lastPassFound: number | null
  windowMinutes: number
  retried: number
  requeued: number
  gaveUp: number
  recentActions: ReconcilerAction[]
}

/** A delivery provider as the service sees it: the shared circuit breaker in front of it. */
export interface ProviderStats {
  /** e.g. "CHES", "ACS". */
  name: string
  channel: 'EMAIL' | 'SMS'
  status: HealthStatus
  reasons: string[]
  /** closed: sending; open: provider failing, sends wait; half-open: one test send in progress. */
  circuit: 'closed' | 'open' | 'half-open' | null
  reopensAt: string | null
  /** Requests in flight and their cap, where one is applied; null where not. */
  inFlight: number | null
  limit: number | null
}

export interface QueueMonitoring {
  generatedAt: string
  status: HealthStatus
  overview: MonitoringOverview
  redis: RedisStats
  messages: MessageChannelStats[]
  queues: QueueStats[]
  sendsInProgress: SendInProgress[]
  workers: WorkerPod[]
  reconciler: ReconcilerStats
  providers: ProviderStats[]
  recentFailures: RecentFailure[]
}
