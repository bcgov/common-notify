import { Logger } from '@nestjs/common'
import { v4 as uuid } from 'uuid'

/**
 * @Queueable Decorator
 *
 * Converts a synchronous endpoint into a fire-and-forget queue handler.  Used to provide rapid responses to notification requests instead of waiting for the entire processing to complete.  Anything with this decorator will do the following:

 * - Stores notification request in DB with status 'queued'
 * - Enqueues job to the specified queue
 * - Returns immediately with fire-and-forget response
 *
 * Usage:
 * @Post('simple')
 * @Queueable('ingestion')
 * async sendSimple(@Body() payload: SimpleNotifyRequest) {}
 *
 * @param queueName - Name of the queue to add job to (default: 'ingestion')
 */
export function Queueable(queueName: string = 'ingestion') {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const logger = new Logger(`Queueable[${queueName}]`)

    descriptor.value = async function (this: any, payload: any, ...args: any[]) {
      const notifyId = uuid() // Generate unique notifyId for tracking
      const correlationId = uuid() // Correlation ID for tracing across logs and systems

      try {
        // Extract tenantId from payload or request context
        const tenantId = payload.tenantId || this.tenantId || args[0]?.user?.tenantId

        if (!tenantId) {
          throw new Error('Unable to determine tenant ID')
        }

        logger.debug(`Queuing notification: ${notifyId}`, { correlationId, tenantId, queueName })

        // TODO: Store in DB with status 'queued'

        logger.log(`Notification request created: ${notifyId}`, {
          correlationId,
          tenantId,
          status: 'queued',
        })

        // Enqueue to ingestion queue
        // Use notifyId as jobId for idempotency (prevents duplicate queuing)
        const queue = this.queues[queueName]
        if (!queue) {
          logger.error(`Queue not found: ${queueName}`, {
            correlationId,
            availableQueues: Object.keys(this.queues),
          })
          throw new Error(
            `Queue "${queueName}" not found. Available queues: ${Object.keys(this.queues).join(', ')}`,
          )
        }

        await queue.add(
          'process',
          {
            notifyId,
            correlationId,
            tenantId,
            request: payload,
            requestedAt: new Date().toISOString(),
          },
          {
            jobId: notifyId, // Idempotency key: prevents duplicate queue entries
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
            removeOnComplete: false, // Keep completed jobs for audit trail
            removeOnFail: false, // Keep failed jobs for investigation
          },
        )

        logger.log(`Job enqueued: ${notifyId}`, {
          correlationId,
          tenantId,
          queue: queueName,
          jobId: notifyId,
        })

        // Return immediately (fire & forget)
        return {
          notifyId,
          correlationId,
          status: 'queued',
          message: 'Notification queued for processing',
        }
      } catch (error) {
        logger.error(`Failed to queue notification: ${notifyId}`, {
          correlationId,
          error: error.message,
          stack: error.stack,
        })
        throw error
      }
    }

    return descriptor
  }
}
