import type Bull from 'bull'
import type Redis from 'ioredis'
import { hostname } from 'os'
import { Logger } from '@nestjs/common'
import { redisKey } from '../common/redis/redis-namespace'

/** How often each pod republishes its worker state. */
export const HEARTBEAT_INTERVAL_MS = 10_000

/** A pod that misses this many intervals drops out of the live list. */
export const HEARTBEAT_TTL_SECONDS = 30

/** Index of pods that have published a heartbeat, scored by the time of their last one. */
export const WORKER_INDEX_KEY = redisKey('monitoring:workers')

export function workerHeartbeatKey(podId: string): string {
  return redisKey(`monitoring:workers:${podId}`)
}

export interface WorkerQueueState {
  queue: string
  concurrency: number
  active: number
  completed: number
  failed: number
  lastFinishedAt: number | null
}

export interface WorkerHeartbeatPayload {
  podId: string
  startedAt: number
  heartbeatAt: number
  queues: WorkerQueueState[]
}

const logger = new Logger('WorkerHeartbeat')

/**
 * Publishes what this pod's Bull workers are doing so the admin monitoring page can list every
 * pod's workers, not just those of the pod that served the request.
 *
 * The counts are this pod's own and are meant to disappear with it: the key expires
 * HEARTBEAT_TTL_SECONDS after the last write, so a crashed or scaled-down pod falls off the
 * list on its own. `completed` and `failed` are since this pod started, not lifetime totals.
 * Bull's `getWorkers()` is not used because it depends on CLIENT LIST, and returns undefined
 * rather than failing when a managed Redis disallows it.
 */
export class WorkerHeartbeat {
  private readonly podId = process.env.HOSTNAME || hostname()
  private readonly startedAt = Date.now()
  private readonly states = new Map<string, WorkerQueueState>()
  private timer?: NodeJS.Timeout

  constructor(private readonly redis: Redis) {}

  /** Track a queue this pod processes. Call once per queue, after its worker is registered. */
  track(queue: Bull.Queue, concurrency: number): void {
    const state: WorkerQueueState = {
      queue: queue.name,
      concurrency,
      active: 0,
      completed: 0,
      failed: 0,
      lastFinishedAt: null,
    }
    this.states.set(queue.name, state)

    queue.on('active', () => {
      state.active++
    })
    queue.on('completed', () => {
      state.active = Math.max(0, state.active - 1)
      state.completed++
      state.lastFinishedAt = Date.now()
    })
    queue.on('failed', () => {
      state.active = Math.max(0, state.active - 1)
      state.failed++
      state.lastFinishedAt = Date.now()
    })
  }

  start(): void {
    if (this.timer) return
    void this.beat()
    this.timer = setInterval(() => void this.beat(), HEARTBEAT_INTERVAL_MS)
    // Never hold the process open just to send a heartbeat.
    this.timer.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  async beat(): Promise<void> {
    const now = Date.now()
    const payload: WorkerHeartbeatPayload = {
      podId: this.podId,
      startedAt: this.startedAt,
      heartbeatAt: now,
      queues: [...this.states.values()],
    }
    try {
      await this.redis
        .multi()
        .set(workerHeartbeatKey(this.podId), JSON.stringify(payload), 'EX', HEARTBEAT_TTL_SECONDS)
        .zadd(WORKER_INDEX_KEY, now, this.podId)
        .exec()
    } catch (error) {
      logger.warn(`Failed to publish worker heartbeat: ${(error as Error).message}`)
    }
  }
}
