import Bull from 'bull'
import Redis from 'ioredis'
import { attachRedisErrorLogging } from '../common/redis/redis-error.util'
import { REDIS_KEY_PREFIX } from '../common/redis/redis-namespace'
import { QueueName } from '../enum/queue-name.enum'

/** Shape of the `redis` block in configuration.ts. */
export interface RedisConfig {
  host: string
  port: number
  password?: string
  db: number
}

/**
 * Connection options shared by every Redis consumer. Password is omitted rather than passed as
 * undefined so a passwordless local Redis does not receive an AUTH command.
 */
export function buildRedisOptions(
  redisConfig: RedisConfig,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const options: Record<string, unknown> = {
    host: redisConfig.host,
    port: redisConfig.port,
    db: redisConfig.db,
    ...overrides,
  }
  if (redisConfig.password) {
    options.password = redisConfig.password
  }
  return options
}

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
  })
  attachRedisErrorLogging(queue, `Queue[${name}]`)
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
