import { Logger } from '@nestjs/common'
import Bull from 'bull'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { NotificationService } from '../../notification/notification.service'
import { QueueName } from '../../enum/queue-name.enum'
import { v4 as uuid } from 'uuid'

/**
 * Context required by the Queueable decorator.
 * Controllers applying @Queueable must implement this interface.
 */
export interface QueueableContext {
  notificationService: NotificationService
  queueMap: Map<QueueName, Bull.Queue>
}

/**
 * @Queueable Decorator
 *
 * This decorator handles the queuing logic for notifications.  Adding this decorator to a controller method will write the request and payload to the notification_request table.
 * We do this to ensure durability of the request (in case Redis is unavailable) and to have a record of all incoming requests for retry purposes.
 * The decorator will attempt to queue the notification to the specified Bull queue. If queuing fails (e.g. Redis is down), the notification remains in PENDING status and will be retried by a scheduled job.
 *
 * @param queueName - Queue to add job to (from QueueName enum)
 */
export function Queueable(queueName: QueueName = QueueName.INGESTION) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const logger = new Logger(`Queueable[${queueName}]`)

    descriptor.value = async function (
      this: QueueableContext,
      tenant?: { id?: string },
      payload?: Record<string, unknown>,
    ) {
      const notifyId = uuid()

      try {
        // Validate required dependencies
        if (!this.notificationService) {
          throw new Error(
            'NotificationService not injected. Ensure controller constructor includes: private readonly notificationService: NotificationService',
          )
        }

        // Get the queue from the controller's queueMap
        const queue = (this as any).queueMap?.get(queueName)
        if (!queue) {
          throw new Error(
            `Queue "${queueName}" not available. Ensure controller initializes queueMap with: this.queueMap = new Map([[${queueName}, this.<queueProperty>]])`,
          )
        }

        // Parameters come in decorator order: tenant (from @GetTenant), payload (from @Body)
        // Both should be present - tenant provides tenant ID, payload provides request data
        if (!tenant || !tenant.id) {
          throw new Error('Tenant information is required but was not provided')
        }

        if (!payload) {
          throw new Error('Request payload is required but was not provided')
        }

        const tenantId = tenant.id
        const resolvedPayload = payload as any

        // Validate that at least one channel is provided
        if (!resolvedPayload.email && !resolvedPayload.sms) {
          throw new Error('At least one channel (email or sms) must be provided')
        }

        // Validate email channel if present
        if (resolvedPayload.email) {
          if (!resolvedPayload.email.to || resolvedPayload.email.to.length === 0) {
            throw new Error('Email channel requires at least one recipient')
          }
          if (!resolvedPayload.email.subject) {
            throw new Error('Email channel requires a subject')
          }
          if (!resolvedPayload.email.body) {
            throw new Error('Email channel requires a body')
          }
        }

        // Validate SMS channel if present
        if (resolvedPayload.sms) {
          if (!resolvedPayload.sms.to || resolvedPayload.sms.to.length === 0) {
            throw new Error('SMS channel requires at least one recipient')
          }
          if (!resolvedPayload.sms.body) {
            throw new Error('SMS channel requires a body')
          }
        }
        // Create DB record with PENDING status.  If redis is unavailable, the scheduled retry job will find this record and attempt to queue it.
        let notificationRecord
        try {
          notificationRecord = await this.notificationService.create({
            tenantId,
            status: NotificationStatus.PENDING,
            createdBy: tenant?.id || 'system',
            payload: resolvedPayload, // Store request payload for retry purposes
          })
          logger.debug(
            `Notification record created in DB with PENDING status: ${notificationRecord.id}`,
            {
              notifyId,
              tenantId,
              recordId: notificationRecord.id,
            },
          )
          logger.log(
            `[DEBUG] Created notification with ID: ${notificationRecord.id} for tenant: ${tenantId}`,
            {
              idType: typeof notificationRecord.id,
              tenantIdType: typeof tenantId,
              tenantIdValue: tenantId,
            },
          )
        } catch (dbError) {
          logger.error(`Failed to create notification record: ${notifyId}`, {
            tenantId,
            error: (dbError as Error).message,
          })
          throw dbError
        }

        // Try to queue to Redis.  If Redis is unavailable, this will throw and we catch it to avoid failing the request.  It will remain PENDING for retry job to process.
        let queueSucceeded = false
        try {
          const jobPayload = {
            notifyId,
            recordId: notificationRecord.id,
            tenantId,
            request: resolvedPayload,
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
            await this.notificationService.update(notificationRecord.id, tenantId, {
              status: NotificationStatus.QUEUED,
              updatedBy: 'system',
            })
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
