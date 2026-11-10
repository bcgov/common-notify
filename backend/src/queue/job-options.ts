import type { BackoffOptions, JobsOptions } from 'bullmq'
import { COMPLETED_JOB_RETENTION, FAILED_JOB_RETENTION } from './job-retention'

/**
 * Backoff for every job here: retry n waits (2^n - 1) x delay, so 2s then 6s at a 2s base. The
 * queues ran on Bull, whose exponential backoff this is; BullMQ's built-in `exponential` is
 * 2^(n-1) x delay (2s, 4s), so jobs name this strategy instead and every Worker registers it.
 */
export const BACKOFF_STRATEGY = 'notify-exponential'

/** BullMQ's `settings.backoffStrategy`. `attemptsMade` counts the attempt that just failed. */
export function backoffStrategy(
  attemptsMade: number,
  type?: string,
  _error?: Error,
  job?: { opts: { backoff?: number | BackoffOptions } },
): number {
  if (type !== BACKOFF_STRATEGY) throw new Error(`Unknown backoff strategy ${type}`)
  const backoff = job?.opts.backoff
  const delay = (typeof backoff === 'object' ? backoff.delay : backoff) ?? 0
  return Math.round((2 ** attemptsMade - 1) * delay)
}

/** Attempts a job gets in all. BullMQ runs a job queued without `attempts` once. */
export function maxAttempts(job: { opts: { attempts?: number } }): number {
  return job.opts.attempts ?? 1
}

/**
 * How long the queue waits before retrying a job whose attempt number `attemptsMade` just failed:
 * BACKOFF_STRATEGY for the jobs queued here, and a fixed delay for a plain number.
 */
export function retryDelay(
  job: { opts: { backoff?: number | BackoffOptions } },
  attemptsMade: number,
): number {
  const { backoff } = job.opts
  if (backoff === undefined) return 0
  if (typeof backoff === 'number') return backoff
  if (backoff.type === BACKOFF_STRATEGY) {
    return backoffStrategy(attemptsMade, backoff.type, undefined, job)
  }
  return backoff.delay ?? 0
}

/** Three attempts, 2s then 6s apart. */
export const RETRY_POLICY = {
  attempts: 3,
  backoff: { type: BACKOFF_STRATEGY, delay: 2000 },
} satisfies JobsOptions

/** An ingestion job: kept an hour once done, so a re-add of the same id is deduplicated. */
export const INGESTION_JOB_OPTIONS = {
  ...RETRY_POLICY,
  removeOnComplete: COMPLETED_JOB_RETENTION,
  removeOnFail: FAILED_JOB_RETENTION,
} satisfies JobsOptions

/** A delivery job: removed once done. Postgres records what it sent. */
export const DELIVERY_JOB_OPTIONS = {
  ...RETRY_POLICY,
  removeOnComplete: true,
  removeOnFail: FAILED_JOB_RETENTION,
} satisfies JobsOptions

/** A webhook job: three attempts, 5s then 15s apart. */
export const WEBHOOK_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: BACKOFF_STRATEGY, delay: 5000 },
  removeOnComplete: COMPLETED_JOB_RETENTION,
  removeOnFail: FAILED_JOB_RETENTION,
} satisfies JobsOptions
