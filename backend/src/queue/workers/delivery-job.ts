import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { DeliveryJobPayload } from '../queue.types'
import { capitalize, DeliveryChannel } from './delivery-channel'
import { StructuredLoggerService } from '../../common/logger'

/** A delivery job that cannot even say which request it is for is malformed, not retryable. */
export function assertDeliveryJob({ notifyId, tenantId }: DeliveryJobPayload): void {
  if (!notifyId || typeof notifyId !== 'string') {
    throw new Error('Invalid delivery job: notifyId is missing or invalid')
  }
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('Invalid delivery job: tenantId is missing or invalid')
  }
}

export function logJobCompleted(
  job: Job<DeliveryJobPayload>,
  queueName: string,
  channel: DeliveryChannel,
  structuredLogger?: StructuredLoggerService,
): void {
  const { notifyId } = job.data
  new Logger(channel.context).debug(
    `[${notifyId}] ${capitalize(channel.displayName)} delivery job completed`,
  )
  structuredLogger?.logQueueOperation('complete', queueName, job.id?.toString(), notifyId, {
    channel: channel.channel,
    context: channel.context,
  })
}

export function logJobFailed(
  job: Job<DeliveryJobPayload>,
  error: Error,
  queueName: string,
  channel: DeliveryChannel,
  structuredLogger?: StructuredLoggerService,
): void {
  const { notifyId } = job.data
  new Logger(channel.context).error(
    `[${notifyId}] ${capitalize(channel.displayName)} delivery job failed (attempt ${job.attemptsMade}/${job.opts.attempts}): error=${error.message}`,
  )
  structuredLogger?.logQueueOperation('failed', queueName, job.id?.toString(), notifyId, {
    channel: channel.channel,
    context: channel.context,
    error: error.message,
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts.attempts,
  })
}
