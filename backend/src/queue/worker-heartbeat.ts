import type Bull from 'bull'
import type Redis from 'ioredis'
import { hostname } from 'node:os'
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
  /** The pod is shutting down: it takes no new jobs and is finishing the ones it holds. */
  draining: boolean
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
  private draining = false
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

    // Keyed by job id, not counted: Bull's stalled-job check emits a local `failed` for jobs
    // another pod abandoned, which a plain counter would take as one of this pod's jobs ending.
    const running = new Set<Bull.JobId>()
    const finish = (job: Bull.Job | undefined, outcome: 'completed' | 'failed') => {
      if (!job || !running.delete(job.id)) return
      state.active = running.size
      state[outcome]++
      state.lastFinishedAt = Date.now()
    }

    queue.on('active', (job: Bull.Job) => {
      running.add(job.id)
      state.active = running.size
    })
    queue.on('completed', (job: Bull.Job) => finish(job, 'completed'))
    queue.on('failed', (job: Bull.Job) => finish(job, 'failed'))
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

  /**
   * Keep reporting while the pod shuts down, flagged as draining, so the jobs it is still
   * finishing show as held rather than as stalled.
   */
  markDraining(): void {
    this.draining = true
    void this.beat()
  }

  /** Drop off the live list straight away instead of waiting for the key to expire. */
  async remove(): Promise<void> {
    this.stop()
    try {
      await this.redis
        .multi()
        .del(workerHeartbeatKey(this.podId))
        .zrem(WORKER_INDEX_KEY, this.podId)
        .exec()
    } catch (error) {
      logger.warn(`Failed to remove worker heartbeat: ${(error as Error).message}`)
    }
  }

  async beat(): Promise<void> {
    const now = Date.now()
    const payload: WorkerHeartbeatPayload = {
      podId: this.podId,
      startedAt: this.startedAt,
      heartbeatAt: now,
      draining: this.draining,
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
