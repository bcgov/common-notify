import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueueName } from '../enum/queue-name.enum'

const bullConstructor = vi.fn()

vi.mock('bull', () => ({
  default: vi.fn().mockImplementation(function (name: string, opts: unknown) {
    bullConstructor(name, opts)
    return { name, on: vi.fn(), add: vi.fn() }
  }),
}))

import {
  buildRedisOptions,
  createQueue,
  QUEUE_MAX_STALLED_COUNT,
  QUEUE_METRICS_MAX_DATA_POINTS,
  type RedisConfig,
} from './redis-connection'

const base: RedisConfig = {
  host: 'common-notify-redis-master',
  port: 6379,
  db: 0,
}

describe('buildRedisOptions', () => {
  it('uses host and port when no sentinels are configured', () => {
    expect(buildRedisOptions(base)).toEqual({
      host: 'common-notify-redis-master',
      port: 6379,
      db: 0,
    })
  })

  it('omits password when unset', () => {
    expect(buildRedisOptions(base)).not.toHaveProperty('password')
  })

  it('includes password when set', () => {
    expect(buildRedisOptions({ ...base, password: 'secret' })).toMatchObject({ password: 'secret' })
  })

  it('switches to sentinel discovery when sentinels are configured', () => {
    const options = buildRedisOptions({
      ...base,
      sentinels: [
        { host: 'node-0', port: 26379 },
        { host: 'node-1', port: 26379 },
      ],
      masterName: 'mymaster',
    })
    expect(options).toMatchObject({
      sentinels: [
        { host: 'node-0', port: 26379 },
        { host: 'node-1', port: 26379 },
      ],
      name: 'mymaster',
      db: 0,
    })
  })

  it('does not pin host or port in sentinel mode', () => {
    const options = buildRedisOptions({
      ...base,
      sentinels: [{ host: 'node-0', port: 26379 }],
    })
    expect(options).not.toHaveProperty('host')
    expect(options).not.toHaveProperty('port')
  })

  it('defaults the master group name when not supplied', () => {
    const options = buildRedisOptions({
      ...base,
      sentinels: [{ host: 'node-0', port: 26379 }],
    })
    expect(options.name).toBe('mymaster')
  })

  it('falls back to host and port when the sentinel list is empty', () => {
    const options = buildRedisOptions({ ...base, sentinels: [] })
    expect(options).toMatchObject({ host: 'common-notify-redis-master', port: 6379 })
    expect(options).not.toHaveProperty('sentinels')
  })

  it('passes sentinelPassword through only when set', () => {
    const withoutPassword = buildRedisOptions({
      ...base,
      sentinels: [{ host: 'node-0', port: 26379 }],
    })
    expect(withoutPassword).not.toHaveProperty('sentinelPassword')

    const withPassword = buildRedisOptions({
      ...base,
      sentinels: [{ host: 'node-0', port: 26379 }],
      sentinelPassword: 'sentinel-secret',
    })
    expect(withPassword).toMatchObject({ sentinelPassword: 'sentinel-secret' })
  })

  it('lets overrides win over derived options', () => {
    const options = buildRedisOptions(base, { db: 3, maxRetriesPerRequest: null })
    expect(options).toMatchObject({ db: 3, maxRetriesPerRequest: null })
  })
})

describe('createQueue', () => {
  beforeEach(() => {
    bullConstructor.mockClear()
  })

  it('enables Bull metrics so completed/failed throughput can be read back per minute', () => {
    createQueue(QueueName.EMAIL_DELIVERY, { host: 'localhost', port: 6379, db: 0 })

    expect(bullConstructor).toHaveBeenCalledWith(
      QueueName.EMAIL_DELIVERY,
      expect.objectContaining({
        metrics: { maxDataPoints: QUEUE_METRICS_MAX_DATA_POINTS },
      }),
    )
  })

  it('keeps a day of one-minute data points by default', () => {
    expect(QUEUE_METRICS_MAX_DATA_POINTS).toBe(1440)
  })

  it('lets a job stall more than once before Bull fails it', () => {
    // A batch can be interrupted twice in one send (a pod deleted, then a deploy). Bull's default
    // of 1 fails it on the second; retries are safe because merge batches skip sent recipients.
    createQueue(QueueName.EMAIL_DELIVERY, { host: 'localhost', port: 6379, db: 0 })

    expect(QUEUE_MAX_STALLED_COUNT).toBe(3)
    expect(bullConstructor).toHaveBeenCalledWith(
      QueueName.EMAIL_DELIVERY,
      expect.objectContaining({ settings: { maxStalledCount: 3 } }),
    )
  })
})
