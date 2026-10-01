import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import type Bull from 'bull'
import type Redis from 'ioredis'
import {
  HEARTBEAT_TTL_SECONDS,
  WORKER_INDEX_KEY,
  WorkerHeartbeat,
  workerHeartbeatKey,
} from './worker-heartbeat'
import type { WorkerHeartbeatPayload } from './worker-heartbeat'

function fakeRedis() {
  const multi = { set: vi.fn(), zadd: vi.fn(), exec: vi.fn().mockResolvedValue([]) }
  multi.set.mockReturnValue(multi)
  multi.zadd.mockReturnValue(multi)
  return { redis: { multi: vi.fn(() => multi) } as unknown as Redis, multi }
}

function fakeQueue(name: string) {
  return Object.assign(new EventEmitter(), { name }) as unknown as Bull.Queue
}

describe('WorkerHeartbeat', () => {
  it('publishes per-queue activity with an expiring key and indexes the pod', async () => {
    const { redis, multi } = fakeRedis()
    const heartbeat = new WorkerHeartbeat(redis)
    const queue = fakeQueue('email-delivery')
    heartbeat.track(queue, 2)

    queue.emit('active')
    queue.emit('active')
    queue.emit('completed')
    queue.emit('active')
    queue.emit('failed')
    await heartbeat.beat()

    const [key, json, mode, ttl] = multi.set.mock.calls[0]
    const payload = JSON.parse(json) as WorkerHeartbeatPayload
    expect(key).toBe(workerHeartbeatKey(payload.podId))
    expect(mode).toBe('EX')
    expect(ttl).toBe(HEARTBEAT_TTL_SECONDS)
    expect(payload.queues).toEqual([
      {
        queue: 'email-delivery',
        concurrency: 2,
        active: 1,
        completed: 1,
        failed: 1,
        lastFinishedAt: expect.any(Number),
      },
    ])
    expect(multi.zadd).toHaveBeenCalledWith(WORKER_INDEX_KEY, payload.heartbeatAt, payload.podId)
  })

  it('never lets the active count go negative', async () => {
    const { redis, multi } = fakeRedis()
    const heartbeat = new WorkerHeartbeat(redis)
    const queue = fakeQueue('sms-delivery')
    heartbeat.track(queue, 1)

    // A job that was already active before this pod started tracking.
    queue.emit('completed')
    await heartbeat.beat()

    const payload = JSON.parse(multi.set.mock.calls[0][1]) as WorkerHeartbeatPayload
    expect(payload.queues[0].active).toBe(0)
  })

  it('swallows Redis errors so a heartbeat never crashes the pod', async () => {
    const { redis, multi } = fakeRedis()
    multi.exec.mockRejectedValue(new Error('connection lost'))
    await expect(new WorkerHeartbeat(redis).beat()).resolves.toBeUndefined()
  })
})
