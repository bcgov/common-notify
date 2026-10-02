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

const job = (id: string | number) => ({ id }) as unknown as Bull.Job

function fakeQueue(name: string) {
  return Object.assign(new EventEmitter(), { name }) as unknown as Bull.Queue
}

describe('WorkerHeartbeat', () => {
  it('publishes per-queue activity with an expiring key and indexes the pod', async () => {
    const { redis, multi } = fakeRedis()
    const heartbeat = new WorkerHeartbeat(redis)
    const queue = fakeQueue('email-delivery')
    heartbeat.track(queue, 2)

    queue.emit('active', job(1))
    queue.emit('active', job(2))
    queue.emit('completed', job(1))
    queue.emit('active', job(3))
    queue.emit('failed', job(2))
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

  it('ignores a job this pod never ran finishing', async () => {
    const { redis, multi } = fakeRedis()
    const heartbeat = new WorkerHeartbeat(redis)
    const queue = fakeQueue('sms-delivery')
    heartbeat.track(queue, 1)

    queue.emit('completed', job(9))
    await heartbeat.beat()

    const payload = JSON.parse(multi.set.mock.calls[0][1]) as WorkerHeartbeatPayload
    expect(payload.queues[0]).toMatchObject({ active: 0, completed: 0 })
  })

  it("keeps a running job busy when the stalled-job check fails another pod's job", async () => {
    // Bull's stalled-job check runs on every worker and emits a local `failed` for a job it
    // gives up on, even one a dead pod was running. That must not end this pod's own job.
    const { redis, multi } = fakeRedis()
    const heartbeat = new WorkerHeartbeat(redis)
    const queue = fakeQueue('email-delivery')
    heartbeat.track(queue, 2)

    queue.emit('active', job('mine'))
    queue.emit('failed', job('abandoned-elsewhere'))
    await heartbeat.beat()

    const payload = JSON.parse(multi.set.mock.calls[0][1]) as WorkerHeartbeatPayload
    expect(payload.queues[0]).toMatchObject({ active: 1, failed: 0 })
  })

  it('swallows Redis errors so a heartbeat never crashes the pod', async () => {
    const { redis, multi } = fakeRedis()
    multi.exec.mockRejectedValue(new Error('connection lost'))
    await expect(new WorkerHeartbeat(redis).beat()).resolves.toBeUndefined()
  })
})
