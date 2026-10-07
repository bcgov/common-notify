import Bull from 'bull'
import Redis from 'ioredis'
import { attachRedisErrorLogging } from '../common/redis/redis-error.util'
import { REDIS_KEY_PREFIX } from '../common/redis/redis-namespace'
import { QueueName } from '../enum/queue-name.enum'
import { countAddedJobs } from './queue-metrics'

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
 * Minutes of completed/failed counts Bull keeps per queue, read back with `queue.getMetrics()`.
 * Each point is one integer in a capped Redis list, so a day of history is a few KB per queue.
 */
export const QUEUE_METRICS_MAX_DATA_POINTS = parseInt(
  process.env.QUEUE_METRICS_MAX_DATA_POINTS || '1440',
  10,
)

/**
 * Times a job may stall (its pod dies or loses its lock mid-job) before Bull fails it instead
 * of retrying. Bull's default of 1 fails a batch interrupted twice, e.g. a pod deleted and then
 * restarted during the same send. A retry is safe: merge batches skip recipients already sent.
 */
export const QUEUE_MAX_STALLED_COUNT = parseInt(process.env.QUEUE_MAX_STALLED_COUNT || '3', 10)

/**
 * Create a Bull queue with an error listener attached.
 *
 * The listener is not optional: without one, a Redis failure prints the raw ioredis error -
 * which carries the AUTH command's arguments - straight to stderr. See redis-error.util.
 */
export function createQueue(name: QueueName, redisConfig: RedisConfig): Bull.Queue {
  const queue = new Bull(name, {
    // Scope the queue to this deployment. Without it every deployment sharing the Redis
    // instance consumes from the same queue, and a job is processed by whichever pod wins the
    // race - which then cannot find the notification in its own database.
    prefix: REDIS_KEY_PREFIX,
    redis: buildRedisOptions(redisConfig, {
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    }),
    metrics: { maxDataPoints: QUEUE_METRICS_MAX_DATA_POINTS },
    settings: { maxStalledCount: QUEUE_MAX_STALLED_COUNT },
  })
  attachRedisErrorLogging(queue, `Queue[${name}]`)
  countAddedJobs(queue)
  return queue
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
