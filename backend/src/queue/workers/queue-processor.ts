import type { Job } from 'bullmq'
import type { QueueName } from '../../enum/queue-name.enum'

/** A worker QueueModule runs against one queue, at the concurrency config gives it. */
export interface QueueProcessor<T = unknown> {
  readonly queueName: QueueName
  /** Key under `queue.` in configuration.ts, and the default when it is unset. */
  readonly concurrency: { configKey: string; default: number }
  process(job: Job<T>): Promise<unknown>
  onCompleted?(job: Job<T>): void
  onFailed?(job: Job<T>, error: Error): void | Promise<void>
}
