import type Bull from 'bull'
import { Logger } from '@nestjs/common'
import { REDIS_KEY_PREFIX } from '../common/redis/redis-namespace'

const logger = new Logger('QueueMetrics')

const MINUTE_MS = 60_000

/**
 * Per-minute "added" counters live this long. Bull records completed/failed itself (see
 * QUEUE_METRICS_MAX_DATA_POINTS) but has no equivalent for adds, so the fill rate is ours.
 */
const ADDED_COUNTER_TTL_SECONDS = 2 * 60 * 60

/** Minutes of history the monitoring endpoint returns per series. */
export const MONITORING_WINDOW_MINUTES = 60

export function minuteOf(timestampMs: number): number {
  return Math.floor(timestampMs / MINUTE_MS)
}

/** The key Bull itself uses for `suffix` on this queue, given our `prefix` option. */
export function bullKey(queueName: string, suffix: string): string {
  return `${REDIS_KEY_PREFIX}:${queueName}:${suffix}`
}

export function addedCounterKey(queueName: string, minute: number): string {
  return bullKey(queueName, `metrics:added:${minute}`)
}

/**
 * Count every job added to `queue` into a per-minute Redis counter.
 *
 * Jobs are added from a dozen call sites, so this wraps `add` once where the queue is built
 * rather than at each of them. Counting is best-effort: a Redis error is logged and never
 * fails the add, which has already succeeded by then. A re-add Bull deduplicates by jobId is
 * still counted, which slightly overstates the fill rate during a pending-sweep retry.
 */
export function countAddedJobs(queue: Bull.Queue): void {
  const add = queue.add.bind(queue) as (...args: unknown[]) => Promise<Bull.Job>
  const counted = async (...args: unknown[]): Promise<Bull.Job> => {
    const job = await add(...args)
    const key = addedCounterKey(queue.name, minuteOf(Date.now()))
    queue.client
      .multi()
      .incr(key)
      .expire(key, ADDED_COUNTER_TTL_SECONDS)
      .exec()
      .catch((error: Error) => {
        logger.warn(`Failed to count added job on ${queue.name}: ${error.message}`)
      })
    return job
  }
  queue.add = counted as Bull.Queue['add']
}

/** Bull's `getMetrics()` result, as returned at runtime (list entries are strings). */
export interface BullMetrics {
  meta: { count: number; prevTS: number; prevCount: number }
  data: Array<string | number>
}

/**
 * Re-align Bull's completed/failed data points onto wall-clock minutes, oldest first.
 *
 * Bull only writes a data point when a job finishes in a later minute than the previous one,
 * so its list is anchored to `prevTS`, not to now: `data[i]` is minute(prevTS) - 1 - i, and
 * jobs finished in minute(prevTS) are still held as `count - prevCount`. Reading the list as
 * if index 0 were the current minute shifts every point by however long the queue has been
 * quiet.
 */
export function alignBullMetrics(metrics: BullMetrics, nowMs: number): number[] {
  const currentMinute = minuteOf(nowMs)
  const flushedMinute = minuteOf(metrics.meta.prevTS)
  const pending = Math.max(0, metrics.meta.count - metrics.meta.prevCount)
  const series: number[] = []

  for (let offset = MONITORING_WINDOW_MINUTES - 1; offset >= 0; offset--) {
    const minute = currentMinute - offset
    if (!metrics.meta.prevTS || minute > flushedMinute) {
      series.push(0)
    } else if (minute === flushedMinute) {
      series.push(pending)
    } else {
      const point = metrics.data[flushedMinute - 1 - minute]
      series.push(point === undefined ? 0 : Number(point) || 0)
    }
  }
  return series
}
