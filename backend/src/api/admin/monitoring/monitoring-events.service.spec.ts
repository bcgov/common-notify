import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import type { ConfigService } from '@nestjs/config'
import {
  CHANGE_THROTTLE_MS,
  MonitoringEventsService,
  QUEUE_CHANGE_EVENTS,
} from './monitoring-events.service'
import { createQueueEvents } from '../../../queue/redis-connection'
import { QueueName } from '../../../enum/queue-name.enum'

vi.mock('../../../queue/redis-connection', () => ({ createQueueEvents: vi.fn() }))

function fakeQueueEvents() {
  return Object.assign(new EventEmitter(), { close: vi.fn().mockResolvedValue(undefined) })
}

const config = (redis: unknown) => ({ get: vi.fn(() => redis) }) as unknown as ConfigService

describe('MonitoringEventsService', () => {
  let readers: Array<ReturnType<typeof fakeQueueEvents>>

  beforeEach(() => {
    vi.useFakeTimers()
    readers = []
    vi.mocked(createQueueEvents)
      .mockReset()
      .mockImplementation(() => {
        const reader = fakeQueueEvents()
        readers.push(reader)
        return reader as never
      })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens no Redis connection until someone watches', () => {
    new MonitoringEventsService(config({ host: 'localhost', port: 6379, db: 0 }))
    expect(createQueueEvents).not.toHaveBeenCalled()
  })

  it('reads every queue and shares the readers between viewers', () => {
    const service = new MonitoringEventsService(config({ host: 'localhost', port: 6379, db: 0 }))
    const a = service.changes$.subscribe()
    const b = service.changes$.subscribe()

    expect(vi.mocked(createQueueEvents).mock.calls.map(([name]) => name)).toEqual(
      Object.values(QueueName),
    )

    a.unsubscribe()
    expect(readers[0].close).not.toHaveBeenCalled()
    b.unsubscribe()
    for (const reader of readers) expect(reader.close).toHaveBeenCalledTimes(1)
  })

  it('signals the first change at once and coalesces a burst into one trailing signal', () => {
    const service = new MonitoringEventsService(config({ host: 'localhost', port: 6379, db: 0 }))
    const received = vi.fn()
    const subscription = service.changes$.subscribe(received)

    for (let i = 0; i < 500; i++) {
      readers[i % readers.length].emit(QUEUE_CHANGE_EVENTS[i % QUEUE_CHANGE_EVENTS.length], {})
    }
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
    expect(createQueueEvents).not.toHaveBeenCalled()
  })
})
