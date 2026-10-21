import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { DeliveryJobPayload } from '../queue.types'
import { QueueProcessor } from './queue-processor'
import { DeliveryChannel } from './delivery-channel'
import { DeliveryFailureHandler } from './delivery-failure-handler'
import { isMergeBatch, MergeBatchRunner, MergeSender } from './merge-batch-runner'
import { assertDeliveryJob, logJobCompleted, logJobFailed } from './delivery-job'
import type { QueueName } from '../../enum/queue-name.enum'
import { StructuredLoggerService } from '../../common/logger'

/**
 * A delivery job's lifecycle, the same on every channel: validate the job, send a merge batch
 * through MergeBatchRunner or a plain send through the channel's own `deliver`, hand any failure
 * to DeliveryFailureHandler, and settle a plain send whose retries ran out. A channel supplies only
 * how it renders and sends.
 */
export abstract class DeliveryWorker implements QueueProcessor<DeliveryJobPayload> {
  abstract readonly queueName: QueueName
  abstract readonly concurrency: { configKey: string; default: number }
  protected abstract readonly channel: DeliveryChannel
  protected abstract readonly logger: Logger

  constructor(
    protected readonly mergeBatches: MergeBatchRunner,
    protected readonly failures: DeliveryFailureHandler,
    protected readonly structuredLogger?: StructuredLoggerService,
  ) {}

  async process(job: Job<DeliveryJobPayload>): Promise<unknown> {
    const { notifyId, tenantId } = job.data
    const startedAt = Date.now()
    this.logger.debug(
      `[${notifyId}] Processing ${this.channel.displayName} delivery job for tenant=${tenantId}`,
    )

    try {
      assertDeliveryJob(job.data)
      if (isMergeBatch(job.data)) {
        return await this.mergeBatches.run(job, await this.mergeSender(job))
      }
      this.structuredLogger?.logNotificationStart(
        notifyId,
        tenantId,
        this.channel.channel,
        this.channel.context,
      )
      return await this.deliver(job, startedAt)
    } catch (error) {
      return this.failures.fail(job, error, this.channel, startedAt)
    }
  }

  onCompleted(job: Job<DeliveryJobPayload>): void {
    logJobCompleted(job, this.queueName, this.channel, this.structuredLogger)
  }

  async onFailed(job: Job<DeliveryJobPayload>, error: Error): Promise<void> {
    logJobFailed(job, error, this.queueName, this.channel, this.structuredLogger)
    await this.failures.failExhausted(job, error, this.channel)
  }

  /** How this channel renders and sends each recipient of a merge batch. */
  protected abstract mergeSender(job: Job<DeliveryJobPayload>): MergeSender | Promise<MergeSender>

  /** Send a plain (non-merge) delivery job. */
  protected abstract deliver(job: Job<DeliveryJobPayload>, startedAt: number): Promise<unknown>
}
