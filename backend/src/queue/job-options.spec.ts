import { describe, it, expect } from 'vitest'
import {
  BACKOFF_STRATEGY,
  DELIVERY_JOB_OPTIONS,
  INGESTION_JOB_OPTIONS,
  WEBHOOK_JOB_OPTIONS,
  backoffStrategy,
  maxAttempts,
  retryDelay,
} from './job-options'
import { COMPLETED_JOB_RETENTION, FAILED_JOB_RETENTION } from './job-retention'

const delayAfter = (attemptsMade: number, options: { backoff: { delay: number } }) =>
  backoffStrategy(attemptsMade, BACKOFF_STRATEGY, undefined, { opts: options })

describe('job options', () => {
  // The retry spacing the queues had on Bull: (2^n - 1) x delay after the nth failed attempt.
  it('retries ingestion and delivery jobs 2s, then 6s, after a failure', () => {
    for (const options of [INGESTION_JOB_OPTIONS, DELIVERY_JOB_OPTIONS]) {
      expect(options.attempts).toBe(3)
      expect(options.backoff.type).toBe(BACKOFF_STRATEGY)
      expect([1, 2].map((attempt) => delayAfter(attempt, options))).toEqual([2000, 6000])
    }
  })

  it('retries webhook jobs 5s, then 15s, after a failure', () => {
    expect(WEBHOOK_JOB_OPTIONS.attempts).toBe(3)
    expect([1, 2].map((attempt) => delayAfter(attempt, WEBHOOK_JOB_OPTIONS))).toEqual([5000, 15000])
  })

  it('reads a numeric backoff as its delay', () => {
    expect(backoffStrategy(3, BACKOFF_STRATEGY, undefined, { opts: { backoff: 1000 } })).toBe(7000)
  })

  it('refuses a strategy it does not implement rather than retrying immediately', () => {
    expect(() => backoffStrategy(1, 'linear')).toThrow('Unknown backoff strategy linear')
  })

  it('keeps ingestion jobs for the dedup window, drops finished delivery jobs, keeps failures', () => {
    expect(INGESTION_JOB_OPTIONS.removeOnComplete).toBe(COMPLETED_JOB_RETENTION)
    expect(DELIVERY_JOB_OPTIONS.removeOnComplete).toBe(true)
    expect(WEBHOOK_JOB_OPTIONS.removeOnComplete).toBe(COMPLETED_JOB_RETENTION)
    for (const options of [INGESTION_JOB_OPTIONS, DELIVERY_JOB_OPTIONS, WEBHOOK_JOB_OPTIONS]) {
      expect(options.removeOnFail).toBe(FAILED_JOB_RETENTION)
    }
  })

  it('reports the retry delay the queue will use, for logging when a retry is due', () => {
    expect([1, 2].map((attempt) => retryDelay({ opts: WEBHOOK_JOB_OPTIONS }, attempt))).toEqual([
      5000, 15000,
    ])
    expect(retryDelay({ opts: { backoff: 1000 } }, 2)).toBe(1000)
    expect(retryDelay({ opts: {} }, 1)).toBe(0)
  })

  it('counts a job queued without attempts as attempted once, as BullMQ runs it', () => {
    expect(maxAttempts({ opts: {} })).toBe(1)
    expect(maxAttempts({ opts: DELIVERY_JOB_OPTIONS })).toBe(3)
  })
})
