import {
  Logger,
  InternalServerErrorException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common'
import Bull from 'bull'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { NotificationService } from '../../api/notification/notification.service'
import { NotificationPubSubService } from '../../api/notification/notification-pubsub.service'
import { QueueName } from '../../enum/queue-name.enum'
import { NotifySimpleRequest } from '../../api/notify/schemas/notify-simple-request'
import { BulkEmailRequest } from '../../api/notify/schemas/bulk-email-request'
import type { ProcessedNotifySimpleRequest } from '../../api/notify/schemas/stored-notify-attachment'
import type { AttachmentProcessingService } from '../../api/notify/services/attachment-processing.service'
import type { AttachmentValidationService } from '../../api/notify/services/attachment-validation.service'
import type { ApiKeyUsageService } from '../../api/api-keys/api-key-usage.service'
import { NotificationChannel } from '../../enum/notification-channel.enum'

/**
 * Context required by the Queueable decorator.
 * Controllers applying @Queueable must implement this interface.
 */
export interface QueueableContext {
  notificationService: NotificationService
  attachmentValidationService: AttachmentValidationService
  attachmentProcessingService: AttachmentProcessingService
  notificationPubSubService?: NotificationPubSubService
  apiKeyUsageService?: ApiKeyUsageService
  queueMap: Map<QueueName, Bull.Queue>
}

/**
 * Attribute accepted notifications against the authenticating API key's usage limits.
 * Non-fatal: usage tracking must never block or fail an accepted send. Skipped when the
 * request has no bound API key (e.g. no credential on the request) or the service is absent.
 */
async function recordAcceptedUsage(
  ctx: QueueableContext,
  apiKeyConsumerId: string | undefined,
  entries: Array<{ channel: string; count: number }>,
): Promise<void> {
  if (!apiKeyConsumerId || !ctx.apiKeyUsageService) return
  const logger = new Logger('Queueable[usage]')
  for (const { channel, count } of entries) {
    if (count <= 0) continue
    try {
      await ctx.apiKeyUsageService.recordUsage(apiKeyConsumerId, channel, count)
    } catch (error) {
      logger.warn(
        `Failed to record ${channel} usage for API key ${apiKeyConsumerId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
}

/**
 * Enforce the API key's daily/annual limits BEFORE a send is accepted. Throws HTTP 429 if any
 * channel would exceed its limit. Unlike usage recording this is NOT swallowed — a rejected
 * request must fail. Skipped when there is no bound API key or the service is absent (fail-open).
 */
async function enforceLimits(
  ctx: QueueableContext,
  apiKeyConsumerId: string | undefined,
  entries: Array<{ channel: string; count: number }>,
): Promise<void> {
  if (!apiKeyConsumerId || !ctx.apiKeyUsageService) return
  await ctx.apiKeyUsageService.assertWithinLimits(apiKeyConsumerId, entries)
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
 * Detect a bulk email payload (the /notifysimple/bulk route). The global ValidationPipe has already
 * validated the body against BulkEmailRequest, so the presence of a `rows` array is sufficient.
 */
function isBulkEmailRequest(payload: unknown): payload is BulkEmailRequest {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    Array.isArray((payload as Record<string, unknown>).rows)
  )
}

/**
 * Handle a bulk email request: validate, persist the parent request, and enqueue ONE ingestion job
 * carrying every recipient address plus the global params. The ingestion worker fans this out into
 * per-batch delivery jobs (and creates the per-recipient detail rows), so this does not call
 * createPending here.
 */
async function handleBulkEmail(
  ctx: QueueableContext,
  queue: Bull.Queue,
  queueName: QueueName,
  tenantId: string,
  dto: BulkEmailRequest,
  apiKeyConsumerId: string | undefined,
) {
  const logger = new Logger(`Queueable[${queueName}][bulk]`)

  const errors = await ctx.notificationService.validateBulkRules(tenantId, dto)
  if (errors.length > 0) {
    throw new UnprocessableEntityException({ message: 'Request validation failed', errors })
  }

  const addresses = ctx.notificationService.parseBulkAddresses(dto.rows)

  // Enforce daily/annual EMAIL limits BEFORE accepting the bulk request (throws HTTP 429).
  await enforceLimits(ctx, apiKeyConsumerId, [
    { channel: NotificationChannel.EMAIL, count: addresses.length },
  ])

  // Persist the parent request (PENDING) for durability before queuing
  const notificationRecord = await ctx.notificationService.create({
    tenantId,
    status: NotificationStatus.PENDING,
    createdBy: tenantId,
    payload: dto as any,
  })
  logger.debug(
    `Bulk notification record created with PENDING status: ${notificationRecord.id} (tenant=${tenantId}, recipients=${addresses.length})`,
  )

  // Attribute accepted bulk emails against the API key's usage limits (non-fatal).
  await recordAcceptedUsage(ctx, apiKeyConsumerId, [
    { channel: NotificationChannel.EMAIL, count: addresses.length },
  ])

  // Publish initial record to SSE subscribers (fire-and-forget), matching the simple flow
  const updateSvc = ctx.notificationPubSubService
  if (updateSvc) {
    updateSvc
      .publish(tenantId, {
        id: notificationRecord.id,
        tenantId: notificationRecord.tenantId,
        status: notificationRecord.status,
        createdAt: notificationRecord.createdAt,
        createdBy: notificationRecord.createdBy ?? undefined,
        updatedAt: notificationRecord.updatedAt,
        updatedBy: notificationRecord.updatedBy ?? undefined,
        tenant: notificationRecord.tenant
          ? {
              id: notificationRecord.tenant.id,
              name: notificationRecord.tenant.name,
              slug: notificationRecord.tenant.slug,
            }
          : undefined,
      })
      .catch((err: Error) =>
        logger.error('Failed to publish SSE event on bulk create', { error: err.message }),
      )
  }

  // Determine if this is a delayed send and calculate the delay in milliseconds
  const delayedSendTimestamp = dto.delayedSend
  let delayMs = 0
  if (delayedSendTimestamp) {
    delayMs = Math.max(0, new Date(delayedSendTimestamp).getTime() - Date.now())
  }
  const hasDelayedSend = !!delayedSendTimestamp

  const response = {
    notifyId: notificationRecord.id,
    templateId: dto.templateId,
    status: hasDelayedSend ? NotificationStatus.SCHEDULED : NotificationStatus.ACCEPTED,
    channels: ['email'],
    createdAt: notificationRecord.createdAt || new Date(),
    message: hasDelayedSend
      ? `Bulk send scheduled for delivery at ${delayedSendTimestamp} with ${addresses.length} recipient(s)`
      : `Bulk send accepted with ${addresses.length} recipient(s)`,
  }

  // Fire off queueing asynchronously - don't block the response.
  // If queuing fails (e.g. Redis down), the record stays PENDING for the retry job.
  setImmediate(async () => {
    try {
      const jobPayload = {
        notifyId: notificationRecord.id,
        tenantId,
        request: { templateId: dto.templateId },
        requestedAt: new Date().toISOString(),
        bulk: true,
        bulkEmail: {
          name: dto.name,
          templateId: dto.templateId,
          params: dto.params,
          addresses,
        },
        ...(delayedSendTimestamp && { scheduledFor: delayedSendTimestamp }),
      }

      const queueOptions: any = {
        jobId: notificationRecord.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: false,
        removeOnFail: false,
      }

      // Add delay if this is a scheduled send
      if (delayMs > 0) {
        queueOptions.delay = delayMs
      }

      await queue.add(jobPayload, queueOptions)

      logger.log(
        `Bulk ingestion job enqueued: ${notificationRecord.id} (tenant=${tenantId}, queue=${queueName})`,
      )

      // For scheduled sends keep status as SCHEDULED; for immediate sends update to QUEUED
      try {
        await ctx.notificationService.update(notificationRecord.id, tenantId, {
          status: hasDelayedSend ? NotificationStatus.SCHEDULED : NotificationStatus.QUEUED,
          updatedBy: 'system',
        })
      } catch (updateError) {
        logger.error(`Failed to update status after queuing bulk job: ${notificationRecord.id}`, {
          tenantId,
          error: (updateError as Error).message,
        })
      }
    } catch (queueError) {
      logger.warn(`Failed to enqueue bulk job (will be retried): ${notificationRecord.id}`, {
        tenantId,
        error: (queueError as Error).message,
      })
    }
  })

  return response
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

    descriptor.value = async function (this: QueueableContext, req?: any, payload?: unknown) {
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

        if (!(this as QueueableContext).attachmentValidationService) {
          throw new InternalServerErrorException(
            'AttachmentValidationService not injected. Ensure controller constructor includes: readonly attachmentValidationService: AttachmentValidationService',
          )
        }

        if (!(this as QueueableContext).attachmentProcessingService) {
          throw new InternalServerErrorException(
            'AttachmentProcessingService not injected. Ensure controller constructor includes: readonly attachmentProcessingService: AttachmentProcessingService',
          )
        }

        // Get tenant from request object (set by TenantGuard)
        const tenant = req?.tenant
        if (!isValidTenantContext(tenant)) {
          logger.error(
            `Queueable decorator: Invalid or missing tenant context. req.tenant = ${JSON.stringify(req?.tenant)}`,
          )
          throw new BadRequestException(
            'Tenant information is required but was not provided or invalid',
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

        const tenantId = tenant.id
        const uploadedBy =
          typeof req?.user?.sub === 'string'
            ? req.user.sub
            : typeof req?.user?.id === 'string'
              ? req.user.id
              : tenantId

        // Bulk email send: a different payload/flow that fans out into batches downstream.
        if (isBulkEmailRequest(payload)) {
          return await handleBulkEmail(
            this as QueueableContext,
            queue,
            queueName,
            tenantId,
            payload,
            req?.apiKeyConsumerId,
          )
        }

        // Payload is guaranteed to be valid by global ValidationPipe
        // (guards run before ValidationPipe in NestJS middleware chain)
        const validatedPayload: NotifySimpleRequest = payload as NotifySimpleRequest

        await (this as QueueableContext).attachmentValidationService.validateAttachments(
          validatedPayload,
        )

        const processedPayload: ProcessedNotifySimpleRequest = await (
          this as QueueableContext
        ).attachmentProcessingService.processAttachments(validatedPayload, tenantId, uploadedBy)

        // Validate business rules (tenant active, recipient counts, content, etc)
        const businessErrors = await (
          this as QueueableContext
        ).notificationService.validateBusinessRules(tenantId, processedPayload)
        if (businessErrors.length > 0) {
          throw new UnprocessableEntityException({
            message: 'Request validation failed',
            errors: businessErrors,
          })
        }

        // Primary (to) recipient count per channel — used for both limit enforcement and usage.
        const usageEntries = [
          {
            channel: NotificationChannel.EMAIL,
            count: processedPayload.email?.recipients?.to?.length ?? 0,
          },
          {
            channel: NotificationChannel.SMS,
            count: processedPayload.sms?.recipients?.to?.length ?? 0,
          },
        ]

        // Enforce daily/annual limits BEFORE accepting. Throws HTTP 429 if the request would
        // exceed a limit, rejecting the whole request before any record is created.
        await enforceLimits(this as QueueableContext, req?.apiKeyConsumerId, usageEntries)

        // Create DB record with PENDING status. If redis is unavailable, the scheduled retry job will find this record and attempt to queue it.
        // This is synchronous and required to succeed.
        let notificationRecord
        try {
          notificationRecord = await (this as QueueableContext).notificationService.create({
            tenantId,
            status: NotificationStatus.PENDING,
            createdBy: tenantId,
            payload: processedPayload, // Store sanitized request payload for retry purposes
          })
          logger.debug(
            `Notification record created in DB with PENDING status: ${notificationRecord.id} (tenant=${tenantId})`,
          )

          // Publish initial record to SSE subscribers (fire-and-forget)
          const updateSvc = (this as QueueableContext).notificationPubSubService
          if (updateSvc) {
            updateSvc
              .publish(tenantId, {
                id: notificationRecord.id,
                tenantId: notificationRecord.tenantId,
                status: notificationRecord.status,
                createdAt: notificationRecord.createdAt,
                createdBy: notificationRecord.createdBy ?? undefined,
                updatedAt: notificationRecord.updatedAt,
                updatedBy: notificationRecord.updatedBy ?? undefined,
                tenant: notificationRecord.tenant
                  ? {
                      id: notificationRecord.tenant.id,
                      name: notificationRecord.tenant.name,
                      slug: notificationRecord.tenant.slug,
                    }
                  : undefined,
              })
              .catch((err: Error) =>
                logger.error('Failed to publish SSE event on create', { error: err.message }),
              )
          }
        } catch (dbError) {
          logger.error(`Failed to create notification record`, {
            tenantId,
            error: (dbError as Error).message,
          })
          throw dbError
        }

        // Return 202 Accepted immediately without waiting for queue operation
        // Queue operation continues asynchronously in the background

        // Determine which channels are included in the request
        const channels: string[] = []
        if (processedPayload.email) channels.push('email')
        if (processedPayload.sms) channels.push('sms')
        if (processedPayload.msgApp) channels.push('msgApp')

        // Attribute accepted notifications against the API key's usage limits (non-fatal).
        await recordAcceptedUsage(this as QueueableContext, req?.apiKeyConsumerId, usageEntries)

        // Determine if this is a delayed send and extract the scheduled timestamp
        const delayedSendTimestamp =
          processedPayload.email?.delayedSend ||
          processedPayload.sms?.delayedSend ||
          processedPayload.msgApp?.delayedSend

        // Calculate delay in milliseconds if delayedSend is present
        let delayMs = 0
        if (delayedSendTimestamp) {
          const scheduledTime = new Date(delayedSendTimestamp).getTime()
          const now = Date.now()
          delayMs = Math.max(0, scheduledTime - now)
        }

        // Determine initial status: SCHEDULED if delayedSend is set, otherwise ACCEPTED
        const hasDelayedSend = !!delayedSendTimestamp
        const initialStatus = hasDelayedSend
          ? NotificationStatus.SCHEDULED
          : NotificationStatus.ACCEPTED

        const response = {
          notifyId: notificationRecord.id,
          status: initialStatus,
          channels: channels.length > 0 ? channels : ['email', 'sms', 'msgApp'],
          createdAt: notificationRecord.createdAt || new Date(),
          message: hasDelayedSend
            ? `Notification scheduled for delivery at ${delayedSendTimestamp}`
            : 'Notification accepted, queuing in progress',
        }

        // Fire off queueing asynchronously - don't block the response
        // If queuing succeeds, status updates to QUEUED
        // If queuing fails, PendingNotificationRetryService will pick it up and retry
        setImmediate(async () => {
          try {
            const jobPayload = {
              notifyId: notificationRecord.id,
              tenantId,
              request: processedPayload,
              requestedAt: new Date().toISOString(),
              ...(delayedSendTimestamp && { scheduledFor: delayedSendTimestamp }),
            }

            const queueOptions: any = {
              jobId: notificationRecord.id,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 2000,
              },
              removeOnComplete: false,
              removeOnFail: false,
            }

            // Add delay if this is a scheduled send
            if (delayMs > 0) {
              queueOptions.delay = delayMs
            }

            await queue.add(jobPayload, queueOptions)

            logger.log(
              `Job successfully enqueued: ${notificationRecord.id} (tenant=${tenantId}, queue=${queueName})`,
            )

            // Update status after queuing
            // For scheduled sends, keep status as SCHEDULED
            // For immediate sends, update to QUEUED
            const statusAfterQueuing = hasDelayedSend
              ? NotificationStatus.SCHEDULED
              : NotificationStatus.QUEUED

            try {
              await (this as QueueableContext).notificationService.update(
                notificationRecord.id,
                tenantId,
                {
                  status: statusAfterQueuing,
                  updatedBy: 'system',
                },
              )
            } catch (updateError) {
              logger.error(`Failed to update status after queuing: ${notificationRecord.id}`, {
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
