import { HttpException, Injectable, Logger, Optional } from '@nestjs/common'
import { describeError } from '../../common/utils/describe-error'
import { Job, UnrecoverableError } from 'bullmq'
import { DeliveryJobPayload } from '../queue.types'
import { DeliveryChannel } from './delivery-channel'
import { maxAttempts } from '../job-options'
import { MergeBatchRunner } from './merge-batch-runner'
import { isTransientDeliveryError } from '../../adapters/delivery-errors'
import { NotificationService } from '../../api/notification/notification.service'
import { NotificationRequestDetailService } from '../../api/notification/notification-request-detail.service'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { StructuredLoggerService } from '../../common/logger'

/** A 400 will fail the same way on every attempt, so it is not retried. */
export function isPermanentValidationError(error: unknown): error is HttpException {
  return error instanceof HttpException && error.getStatus() === 400
}

/** The same failure, marked so BullMQ fails the job now instead of spending its retries. */
export function notRetried(error: unknown): UnrecoverableError {
  const unrecoverable = new UnrecoverableError(describeError(error))
  unrecoverable.cause = error
  return unrecoverable
}

/**
 * Decides what a failed email or SMS delivery attempt leaves behind, then rethrows so the queue
 * applies its retry policy - or fails the job outright, when retrying cannot help:
 *   - a transient provider error marks nothing, even on the last attempt - the recipients stay
 *     owed, and the delivery reconciler re-queues the job once the queue's retries are spent;
 *   - a merge batch fails only its own unsent rows, on its last attempt or a permanent error;
 *   - a plain send is marked FAILED on a permanent error (and not retried) or its last attempt.
 */
@Injectable()
export class DeliveryFailureHandler {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly requestDetailService: NotificationRequestDetailService,
    private readonly mergeBatches: MergeBatchRunner,
    @Optional() private readonly structuredLogger?: StructuredLoggerService,
  ) {}

  async fail(
    job: Job<DeliveryJobPayload>,
    error: unknown,
    channel: DeliveryChannel,
    startedAt: number,
  ): Promise<never> {
    const logger = new Logger(channel.context)
    const { notifyId, tenantId } = job.data
    const errorMessage = describeError(error)
    const attempt = (job.attemptsMade ?? 0) + 1
    const attempts = maxAttempts(job)
    const finalAttempt = attempt >= attempts
    logger.error(
      `[${notifyId}] Failed to send ${channel.displayName} delivery job (attempt ${attempt}/${attempts}): ${errorMessage}`,
      error instanceof Error ? error.stack : '',
    )

    if (isTransientDeliveryError(error)) throw error

    if (job.data.mailMerge && job.data.batchId) {
      if (finalAttempt || isPermanentValidationError(error)) {
        await this.mergeBatches.failUnsent(job, errorMessage, channel)
        throw notRetried(error)
      }
      throw error
    }

    if (isPermanentValidationError(error)) {
      await this.markFailed(notifyId, tenantId, errorMessage)
      logger.error(
        `[${notifyId}] Notification marked as FAILED after permanent validation error. Error: ${errorMessage}`,
      )
      throw notRetried(error)
    }

    if (finalAttempt) {
      await this.markFailed(notifyId, tenantId, errorMessage)
      logger.error(
        `[${notifyId}] Notification marked as FAILED after ${attempts} attempt(s). Error: ${errorMessage}`,
      )
      this.structuredLogger?.logNotificationFailure(
        notifyId,
        tenantId,
        channel.channel,
        error instanceof Error ? error : errorMessage,
        Date.now() - startedAt,
        channel.context,
      )
    }
    throw error
  }

  /**
   * Once the queue has spent every retry, mark a plain send FAILED even if the processor's
   * final-attempt handling did not run (a job queued without a retry count, or a different
   * worker processing the last attempt). Not for a transient error - the recipients stay owed
   * for the reconciler - nor for a merge batch, which the processor settled itself, scoped to
   * that batch. A job that stalls out never reaches the worker's `failed` event, so this does not
   * see it; the delivery reconciler finds it failed and retries it.
   */
  async failExhausted(
    job: Job<DeliveryJobPayload>,
    error: Error,
    channel: DeliveryChannel,
  ): Promise<void> {
    if (isTransientDeliveryError(error) || (job.data.mailMerge && job.data.batchId)) return
    const attemptsMade = job.attemptsMade ?? 0
    if (attemptsMade < maxAttempts(job)) return

    const logger = new Logger(channel.context)
    const { notifyId, tenantId } = job.data
    try {
      await this.markFailed(notifyId, tenantId, error.message)
      logger.error(
        `[${notifyId}] Notification marked as FAILED (delivery job exhausted after ${attemptsMade} attempt(s))`,
      )
    } catch (markError) {
      logger.error(
        `[${notifyId}] Failed to mark notification FAILED after job exhaustion: ${describeError(
          markError,
        )}`,
      )
    }
  }

  /** The request FAILED, and every recipient it had not reached. */
  async markFailed(notifyId: string, tenantId: string, errorMessage: string): Promise<void> {
    await this.notificationService.update(notifyId, tenantId, {
      status: NotificationStatus.FAILED,
      updatedBy: 'system',
      errorReason: errorMessage,
    })
    await this.requestDetailService.markFailed(notifyId, errorMessage)
  }
}
