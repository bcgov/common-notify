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
  createQueue,
  QUEUE_MAX_STALLED_COUNT,
  QUEUE_METRICS_MAX_DATA_POINTS,
} from './redis-connection'

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
