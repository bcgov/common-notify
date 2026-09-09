/**
 * Retention for Bull jobs.
 *
 * Redis is capped at 768mb with `maxmemory-policy noeviction` (charts/redis/values.yml), so a
 * queue that keeps every job it has ever run eventually makes Redis reject writes - which
 * stops enqueue altogether, not just this queue. Both sets are bounded by age and count.
 *
 * The completed window is not an audit log; notification_request and its history table are.
 * It exists so that re-adding the same jobId within the window is deduplicated by Bull, which
 * is what stops the pending-notification sweep from queueing a request the original request
 * path has already queued but not yet marked QUEUED. An hour is far longer than that race
 * (the sweep runs every 30s) while still bounding what Redis holds.
 */
export interface JobRetention {
  /** Maximum age in seconds. */
  age: number
  /** Maximum number of jobs kept, whichever bound is hit first. */
  count: number
}

export const COMPLETED_JOB_RETENTION: JobRetention = {
  age: parseInt(process.env.QUEUE_COMPLETED_RETENTION_SECONDS || '3600', 10),
  count: parseInt(process.env.QUEUE_COMPLETED_RETENTION_COUNT || '1000', 10),
}

/** Failed jobs are kept longer because they are read when diagnosing a delivery problem. */
export const FAILED_JOB_RETENTION: JobRetention = {
  age: parseInt(process.env.QUEUE_FAILED_RETENTION_SECONDS || '604800', 10),
  count: parseInt(process.env.QUEUE_FAILED_RETENTION_COUNT || '1000', 10),
}
