import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import type { ConfigService } from '@nestjs/config'
import { CHANGE_THROTTLE_MS, MonitoringEventsService } from './monitoring-events.service'
import { createRedisClient } from '../../../queue/redis-connection'
import { QueueName } from '../../../enum/queue-name.enum'
import { bullKey } from '../../../queue/queue-metrics'

vi.mock('../../../queue/redis-connection', () => ({ createRedisClient: vi.fn() }))

function fakeRedis() {
  return Object.assign(new EventEmitter(), {
    psubscribe: vi.fn().mockResolvedValue(4),
    quit: vi.fn().mockResolvedValue('OK'),
    disconnect: vi.fn(),
  })
}

const config = (redis: unknown) => ({ get: vi.fn(() => redis) }) as unknown as ConfigService

describe('MonitoringEventsService', () => {
  let redis: ReturnType<typeof fakeRedis>

  beforeEach(() => {
    vi.useFakeTimers()
    redis = fakeRedis()
    vi.mocked(createRedisClient)
      .mockReset()
      .mockReturnValue(redis as never)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens no Redis connection until someone watches', () => {
    new MonitoringEventsService(config({ host: 'localhost', port: 6379, db: 0 }))
    expect(createRedisClient).not.toHaveBeenCalled()
  })

  it('subscribes to every queue and shares one connection between viewers', () => {
    const service = new MonitoringEventsService(config({ host: 'localhost', port: 6379, db: 0 }))
    const a = service.changes$.subscribe()
    const b = service.changes$.subscribe()

    expect(createRedisClient).toHaveBeenCalledTimes(1)
    expect(redis.psubscribe).toHaveBeenCalledWith(
      ...Object.values(QueueName).map((name) => bullKey(name, '*')),
    )

    a.unsubscribe()
    expect(redis.quit).not.toHaveBeenCalled()
    b.unsubscribe()
    expect(redis.quit).toHaveBeenCalledTimes(1)
  })

  it('signals the first change at once and coalesces a burst into one trailing signal', () => {
    const service = new MonitoringEventsService(config({ host: 'localhost', port: 6379, db: 0 }))
    const received = vi.fn()
    const subscription = service.changes$.subscribe(received)

    for (let i = 0; i < 500; i++) redis.emit('pmessage', 'p', 'c', 'm')
    expect(received).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(CHANGE_THROTTLE_MS)
    expect(received).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(CHANGE_THROTTLE_MS * 5)
    expect(received).toHaveBeenCalledTimes(2)
    subscription.unsubscribe()
  })

  it('emits nothing when Redis is not configured', () => {
    const service = new MonitoringEventsService(config(undefined))
    const complete = vi.fn()
    service.changes$.subscribe({ complete })
    expect(complete).toHaveBeenCalled()
    expect(createRedisClient).not.toHaveBeenCalled()
  })
})
