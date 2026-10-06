import { describe, it, expect, vi, afterEach } from 'vitest'
import type Bull from 'bull'
import { QueueModule } from './queue.module'
import type { WorkerHeartbeat } from './worker-heartbeat'

type Heartbeat = Pick<WorkerHeartbeat, 'markDraining' | 'remove'>

function moduleWith(close: () => Promise<void>) {
  const queue = {
    pause: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(close),
  } as unknown as Bull.Queue
  const heartbeat: Heartbeat = {
    markDraining: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
  }
  const module = new QueueModule(queue, queue, queue, null as unknown as Bull.Queue)
  // Set by onModuleInit when workers start; that path needs the whole worker graph.
  ;(module as unknown as { heartbeat: Heartbeat }).heartbeat = heartbeat
  return { module, queue, heartbeat }
}

describe('QueueModule shutdown', () => {
  afterEach(() => {
    vi.useRealTimers()
    delete process.env.QUEUE_SHUTDOWN_DRAIN_MS
  })

  it('keeps reporting as draining instead of going silent when shutdown starts', () => {
    const { module, heartbeat } = moduleWith(() => Promise.resolve())
    module.onModuleDestroy()
    expect(heartbeat.markDraining).toHaveBeenCalled()
  })

  it('waits for in-flight jobs, then drops the pod off the live list', async () => {
    const { module, queue, heartbeat } = moduleWith(() => Promise.resolve())

    await module.beforeApplicationShutdown()

    // Three queues present (webhook absent): each stops taking work, then closes once its
    // active jobs finish.
    expect(queue.pause).toHaveBeenCalledTimes(3)
    expect(queue.close).toHaveBeenCalledTimes(3)
    expect(heartbeat.remove).toHaveBeenCalled()
  })

  it('gives up at the drain limit and keeps the heartbeat for jobs still running', async () => {
    vi.useFakeTimers()
    process.env.QUEUE_SHUTDOWN_DRAIN_MS = '5000'
    const { module, heartbeat } = moduleWith(() => new Promise(() => {}))

    const shutdown = module.beforeApplicationShutdown()
    await vi.advanceTimersByTimeAsync(5000)
    await shutdown

    expect(heartbeat.remove).not.toHaveBeenCalled()
  })

  it('does not throw out of shutdown when closing a queue fails', async () => {
    const { module, heartbeat } = moduleWith(() => Promise.reject(new Error('connection lost')))

    await expect(module.beforeApplicationShutdown()).resolves.toBeUndefined()
    expect(heartbeat.remove).not.toHaveBeenCalled()
  })
})
