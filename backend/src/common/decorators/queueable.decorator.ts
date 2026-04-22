import { Logger, InternalServerErrorException, BadRequestException } from '@nestjs/common'
import Bull from 'bull'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { NotificationService } from '../../notification/notification.service'
import { QueueName } from '../../enum/queue-name.enum'
import { v4 as uuid } from 'uuid'
import { NotifySimpleRequest } from '../../api/notify/schemas/notify-simple-request'

/**
 * Context required by the Queueable decorator.
 * Controllers applying @Queueable must implement this interface.
 */
export interface QueueableContext {
  notificationService: NotificationService
  queueMap: Map<QueueName, Bull.Queue>
}

/**
 * Type guard to validate tenant context
 * Ensures tenant has a valid string ID
 */
function isValidTenantContext(tenant: unknown): tenant is { id: string } {
  return (
    typeof tenant === 'object' &&
    tenant !== null &&
    typeof (tenant as Record<string, unknown>).id === 'string'
  )
}

/**
 * @Queueable Decorator
 *
 * This decorator handles the queuing logic for notifications with strong type safety.
 * Adding this decorator to a controller method will write the request and payload to the notification_request table.
 * We do this to ensure durability of the request (in case Redis is unavailable) and to have a record of all incoming requests for retry purposes.
 *
 * **Validation:** Request payloads are validated by NestJS's global ValidationPipe before this decorator runs,
 * so the payload is guaranteed to match NotifySimpleRequest schema. The decorator focuses solely on queuing logic.
 *
 * The decorator will attempt to queue the notification to the specified Bull queue. If queuing fails (e.g. Redis is down),
 * the notification remains in PENDING status and will be retried by a scheduled job.
 *
 * @param queueName - Queue to add job to (from QueueName enum)
 */
export function Queueable(queueName: QueueName = QueueName.INGESTION) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const logger = new Logger(`Queueable[${queueName}]`)

    descriptor.value = async function (
      this: QueueableContext,
      tenant?: unknown,
      payload?: unknown,
    ) {
      const notifyId = uuid()

      try {
        // Validate required dependencies
        if (!this || typeof this !== 'object') {
          throw new InternalServerErrorException('Decorator context is invalid')
        }

        if (!(this as QueueableContext).notificationService) {
          throw new InternalServerErrorException(
            'NotificationService not injected. Ensure controller constructor includes: private readonly notificationService: NotificationService',
          )
        }

        // Validate queueMap exists and is a Map
        const queueMap = (this as QueueableContext).queueMap
        if (!(queueMap instanceof Map)) {
          throw new InternalServerErrorException(
            `Queue map not initialized. Ensure controller initializes queueMap with: this.queueMap = new Map([[${queueName}, this.<queueProperty>]])`,
          )
        }

        // Get the queue from the controller's queueMap with type safety
        const queue = queueMap.get(queueName)
        if (!queue) {
          throw new InternalServerErrorException(
            `Queue "${queueName}" not available in queueMap. Available queues: ${Array.from(queueMap.keys()).join(', ')}`,
          )
        }

        // Validate tenant context with type guard
        if (!isValidTenantContext(tenant)) {
          throw new BadRequestException(
            'Tenant information is required but was not provided or invalid',
          )
        }

        const tenantId = tenant.id

        // Payload is guaranteed to be valid by global ValidationPipe
        // (guards run before ValidationPipe in NestJS middleware chain)
        const validatedPayload: NotifySimpleRequest = payload as NotifySimpleRequest

        // Create DB record with PENDING status. If redis is unavailable, the scheduled retry job will find this record and attempt to queue it.
        let notificationRecord
        try {
          notificationRecord = await (this as QueueableContext).notificationService.create({
            tenantId,
            status: NotificationStatus.PENDING,
            createdBy: tenantId,
            payload: validatedPayload, // Store request payload for retry purposes
          })
          logger.debug(
            `Notification record created in DB with PENDING status: ${notificationRecord.id}`,
            {
              notifyId,
              tenantId,
              recordId: notificationRecord.id,
            },
          )
        } catch (dbError) {
          logger.error(`Failed to create notification record: ${notifyId}`, {
            tenantId,
            error: (dbError as Error).message,
          })
          throw dbError
        }

        // Try to queue to Redis. If Redis is unavailable, this will throw and we catch it to avoid failing the request.
        // It will remain PENDING for retry job to process.
        let queueSucceeded = false
        try {
          const jobPayload = {
            notifyId,
            recordId: notificationRecord.id,
            tenantId,
            request: validatedPayload,
            requestedAt: new Date().toISOString(),
          }

          await queue.add(jobPayload, {
            jobId: notifyId,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
            removeOnComplete: false,
            removeOnFail: false,
          })

          queueSucceeded = true
          logger.log(`Job successfully enqueued: ${notifyId}`, {
            tenantId,
            queue: queueName,
            jobId: notifyId,
          })
        } catch (queueError) {
          // Redis unavailable... but that's OK, the status stays PENDING, and a retry job will pick it up to enqueue it once Redis is back up.
          logger.warn(`Failed to enqueue job (will retry): ${notifyId}`, {
            tenantId,
            error: (queueError as Error).message,
            errorStack: (queueError as Error).stack,
          })
        }

        // Update status to QUEUED only if Redis accepted the job
        if (queueSucceeded) {
          try {
            await (this as QueueableContext).notificationService.update(
              notificationRecord.id,
              tenantId,
              {
                status: NotificationStatus.QUEUED,
                updatedBy: 'system',
              },
            )
          } catch (updateError) {
            logger.error(`Failed to update status to QUEUED: ${notifyId}`, {
              tenantId,
              error: (updateError as Error).message,
            })
            // Job is already in queue, so we log but don't throw
          }
        } else {
          logger.log(`Notification stays PENDING, will be retried by scheduled job: ${notifyId}`, {
            tenantId,
          })
        }

        // Return 202 Accepted immediately (fire & forget)
        // Client gets same response whether queued now or will be queued by retry job
        return {
          notifyId,
          recordId: notificationRecord.id,
          status: queueSucceeded ? NotificationStatus.QUEUED : NotificationStatus.PENDING,
          message: queueSucceeded
            ? 'Notification queued for processing'
            : 'Notification accepted, will be queued shortly',
        }
      } catch (error) {
        logger.error(`Failed to queue notification: ${notifyId}`, {
          error: (error as Error).message,
          stack: (error as Error).stack,
        })
        throw error
      }
    }

    return descriptor
  }
}
