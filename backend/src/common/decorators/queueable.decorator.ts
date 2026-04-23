import {
  Logger,
  InternalServerErrorException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common'
import Bull from 'bull'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { NotificationService } from '../../notification/notification.service'
import { QueueName } from '../../enum/queue-name.enum'
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
 * Validation: Request payloads are validated by NestJS's global ValidationPipe before this decorator runs,
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

        // Validate business rules (tenant active, recipient counts, content, etc)
        const businessErrors = await (
          this as QueueableContext
        ).notificationService.validateBusinessRules(tenantId, validatedPayload)
        if (businessErrors.length > 0) {
          throw new UnprocessableEntityException({
            message: 'Request validation failed',
            errors: businessErrors,
          })
        }

        // Create DB record with PENDING status. If redis is unavailable, the scheduled retry job will find this record and attempt to queue it.
        // This is synchronous and required to succeed.
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
              notifyId: notificationRecord.id,
              tenantId,
            },
          )
        } catch (dbError) {
          logger.error(`Failed to create notification record`, {
            tenantId,
            error: (dbError as Error).message,
          })
          throw dbError
        }

        // Return 202 Accepted immediately without waiting for queue operation
        // Queue operation continues asynchronously in the background
        const response = {
          notifyId: notificationRecord.id,
          status: NotificationStatus.PENDING,
          message: 'Notification accepted, queuing in progress',
        }

        // Fire off queueing asynchronously - don't block the response
        // If queuing succeeds, status updates to QUEUED
        // If queuing fails, PendingNotificationRetryService will pick it up and retry
        setImmediate(async () => {
          try {
            const jobPayload = {
              notifyId: notificationRecord.id,
              tenantId,
              request: validatedPayload,
              requestedAt: new Date().toISOString(),
            }

            await queue.add(jobPayload, {
              jobId: notificationRecord.id,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 2000,
              },
              removeOnComplete: false,
              removeOnFail: false,
            })

            logger.log(`Job successfully enqueued: ${notificationRecord.id}`, {
              tenantId,
              queue: queueName,
              jobId: notificationRecord.id,
            })

            // Update status to QUEUED now that it's in Redis
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
              logger.error(`Failed to update status to QUEUED: ${notificationRecord.id}`, {
                tenantId,
                error: (updateError as Error).message,
              })
            }
          } catch (queueError) {
            // Redis unavailable... that's OK, status stays PENDING
            // PendingNotificationRetryService will pick it up once Redis is back
            logger.warn(`Failed to enqueue job (will be retried): ${notificationRecord.id}`, {
              tenantId,
              error: (queueError as Error).message,
              errorStack: (queueError as Error).stack,
            })
          }
        })

        return response
      } catch (error) {
        logger.error(`Failed to queue notification`, {
          error: (error as Error).message,
          stack: (error as Error).stack,
        })
        throw error
      }
    }

    return descriptor
  }
}
