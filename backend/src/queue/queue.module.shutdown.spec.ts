import { describe, it, expect, vi, afterEach } from 'vitest'
import { QueueModule } from './queue.module'
import { QueueName } from '../enum/queue-name.enum'
import type { WorkerHeartbeat } from './worker-heartbeat'

type Heartbeat = Pick<WorkerHeartbeat, 'markDraining' | 'remove'>

function moduleWith(close: () => Promise<void>) {
  const worker = { pause: vi.fn().mockResolvedValue(undefined), close: vi.fn(close) }
  const heartbeat: Heartbeat = {
    markDraining: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
  }
  const module = new QueueModule()
  // Set by onModuleInit when workers start; that path needs the whole worker graph.
  const internals = module as unknown as { heartbeat: Heartbeat; workers: Map<QueueName, unknown> }
  internals.heartbeat = heartbeat
  // Three workers running (webhook absent).
  for (const name of [QueueName.INGESTION, QueueName.EMAIL_DELIVERY, QueueName.SMS_DELIVERY]) {
    internals.workers.set(name, worker)
  }
  return { module, worker, heartbeat }
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
    const { module, worker, heartbeat } = moduleWith(() => Promise.resolve())

    await module.beforeApplicationShutdown()

    // Each worker stops taking work, then closes once its active jobs finish.
    expect(worker.pause).toHaveBeenCalledTimes(3)
    expect(worker.close).toHaveBeenCalledTimes(3)
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

  it('does not throw out of shutdown when closing a worker fails', async () => {
    const { module, heartbeat } = moduleWith(() => Promise.reject(new Error('connection lost')))

    await expect(module.beforeApplicationShutdown()).resolves.toBeUndefined()
    expect(heartbeat.remove).not.toHaveBeenCalled()
  })
})
