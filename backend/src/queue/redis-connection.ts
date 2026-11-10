import { Job, Queue, QueueEvents, Worker } from 'bullmq'
import Redis from 'ioredis'
import { attachRedisErrorLogging } from '../common/redis/redis-error.util'
import { QUEUE_KEY_PREFIX } from '../common/redis/redis-namespace'
import { QueueName } from '../enum/queue-name.enum'
import { countAddedJobs } from './queue-metrics'
import { backoffStrategy } from './job-options'

/** Shape of the `redis` block in configuration.ts. */
export interface RedisSentinelNode {
  host: string
  port: number
}

export interface RedisConfig {
  host: string
  port: number
  password?: string
  db: number
  sentinels?: RedisSentinelNode[]
  masterName?: string
  sentinelPassword?: string
}

/**
 * Connection options shared by every Redis consumer. Password is omitted rather than passed as
 * undefined so a passwordless local Redis does not receive an AUTH command.
 */
export function buildRedisOptions(
  redisConfig: RedisConfig,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const options: Record<string, unknown> = { db: redisConfig.db }
  if (redisConfig.sentinels?.length) {
    options.sentinels = redisConfig.sentinels
    options.name = redisConfig.masterName ?? 'mymaster'
    if (redisConfig.sentinelPassword) {
      options.sentinelPassword = redisConfig.sentinelPassword
    }
  } else {
    options.host = redisConfig.host
    options.port = redisConfig.port
  }
  if (redisConfig.password) {
    options.password = redisConfig.password
  }
  return { ...options, ...overrides }
}

/**
 * Minutes of completed/failed counts BullMQ keeps per queue, read back with `queue.getMetrics()`.
 * Each point is one integer in a capped Redis list, so a day of history is a few KB per queue.
 */
export const QUEUE_METRICS_MAX_DATA_POINTS = Number.parseInt(
  process.env.QUEUE_METRICS_MAX_DATA_POINTS || '1440',
  10,
)

/**
 * Times a job may stall (its pod dies or loses its lock mid-job) before BullMQ fails it instead
 * of retrying. The default of 1 fails a batch interrupted twice, e.g. a pod deleted and then
 * restarted during the same send. A retry is safe: merge batches skip recipients already sent.
 */
export const QUEUE_MAX_STALLED_COUNT = Number.parseInt(
  process.env.QUEUE_MAX_STALLED_COUNT || '3',
  10,
)

/** Approximate length the events stream is trimmed to, per queue. */
export const QUEUE_EVENTS_MAX_LEN = 1000

/**
 * BullMQ opens its own connections from these options, one per Queue and two per Worker. Its
 * workers block on Redis, so a command must never be failed for taking too long.
 */
function queueConnection(redisConfig: RedisConfig): Record<string, unknown> {
  return buildRedisOptions(redisConfig, { enableReadyCheck: false, maxRetriesPerRequest: null })
}

/**
 * Create a BullMQ queue - the producer side - with an error listener attached.
 *
 * The listener is not optional: without one, a Redis failure prints the raw ioredis error -
 * which carries the AUTH command's arguments - straight to stderr. See redis-error.util.
 * `redis` counts each add for the monitoring page's fill rate; omit it to skip counting.
 */
export function createQueue<T = unknown>(
  name: QueueName,
  redisConfig: RedisConfig,
  redis?: Redis | null,
): Queue<T> {
  const queue = new Queue<T>(name, {
    // Scope the queue to this deployment. Without it every deployment sharing the Redis
    // instance consumes from the same queue, and a job is processed by whichever pod wins the
    // race - which then cannot find the notification in its own database.
    prefix: QUEUE_KEY_PREFIX,
    connection: queueConnection(redisConfig),
    // The events stream is only read live, by the monitoring page; the default keeps 10,000
    // events per queue per deployment in a Redis that refuses writes once it is full.
    streams: { events: { maxLen: QUEUE_EVENTS_MAX_LEN } },
  })
  attachRedisErrorLogging(queue, `Queue[${name}]`)
  if (redis) countAddedJobs(queue as Queue, redis)
  return queue
}

/** Create a BullMQ worker for a queue, with the same error-logging guarantee. */
export function createWorker<T>(
  name: QueueName,
  processor: (job: Job<T>) => Promise<unknown>,
  redisConfig: RedisConfig,
  concurrency: number,
): Worker<T> {
  const worker = new Worker<T>(name, processor, {
    prefix: QUEUE_KEY_PREFIX,
    connection: queueConnection(redisConfig),
    concurrency,
    maxStalledCount: QUEUE_MAX_STALLED_COUNT,
    metrics: { maxDataPoints: QUEUE_METRICS_MAX_DATA_POINTS },
    settings: { backoffStrategy },
  })
  attachRedisErrorLogging(worker, `Worker[${name}]`)
  return worker
}

/** Listen to a queue's events stream, from every pod, with the same error-logging guarantee. */
export function createQueueEvents(name: QueueName, redisConfig: RedisConfig): QueueEvents {
  const events = new QueueEvents(name, {
    prefix: QUEUE_KEY_PREFIX,
    connection: queueConnection(redisConfig),
  })
  attachRedisErrorLogging(events, `QueueEvents[${name}]`)
  return events
}

/** Create a plain Redis client with the same error-logging guarantee. */
export function createRedisClient(
  redisConfig: RedisConfig,
  context: string,
  overrides: Record<string, unknown> = {},
): Redis {
  const client = new Redis(buildRedisOptions(redisConfig, overrides) as never)
  attachRedisErrorLogging(client, context)
  return client
}
