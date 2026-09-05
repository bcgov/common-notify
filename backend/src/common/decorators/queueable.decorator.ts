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
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { NotifySimpleRequest } from '../../api/notify/schemas/notify-simple-request'
import type { ProcessedNotifySimpleRequest } from '../../api/notify/schemas/stored-notify-attachment'
import type { AttachmentProcessingService } from '../../api/notify/services/attachment-processing.service'
import type { AttachmentValidationService } from '../../api/notify/services/attachment-validation.service'
import { extractRequestRoute } from '../utils/extract-request-route'
import type {
  ApiKeyUsageService,
  RecordedUsageResult,
} from '../../api/api-keys/api-key-usage.service'
import type { LimitAlertNotificationService } from '../../api/notify/services/limit-alert-notification.service'
import type { SafelistCandidate, SafelistService } from '../../api/safelist/safelist.service'
import type { NotificationRequestDetailService } from '../../api/notification/notification-request-detail.service'
import type { SmsSegmentService } from '../../api/notify/services/sms-segment.service'

interface AcceptedUsageResult extends RecordedUsageResult {
  channelCode: string
}

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
  limitAlertNotificationService?: LimitAlertNotificationService
  safelistService?: SafelistService
  notificationRequestDetailService?: NotificationRequestDetailService
  smsSegmentService?: SmsSegmentService
  queueMap: Map<QueueName, Bull.Queue>
}

/**
 * Billable segments a single SMS recipient of this request will cost.
 *
 * A message over the single-segment budget is concatenated and every segment is billed as its
 * own message by the carrier, so usage is attributed in segments. Falls back to 1 when the
 * service is unavailable or the body cannot be resolved — never blocks a send.
 */
async function resolveSmsSegments(
  ctx: QueueableContext,
  tenantId: string,
  payload: ProcessedNotifySimpleRequest,
): Promise<number> {
  if (!ctx.smsSegmentService) return 1
  try {
    return Math.max(1, await ctx.smsSegmentService.countSegmentsPerRecipient(tenantId, payload))
  } catch (error) {
    new Logger('Queueable[sms-segments]').warn(
      `Failed to count SMS segments, billing as a single segment: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return 1
  }
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
): Promise<AcceptedUsageResult[]> {
  if (!apiKeyConsumerId || !ctx.apiKeyUsageService) return []
  const logger = new Logger('Queueable[usage]')
  const results: AcceptedUsageResult[] = []
  for (const { channel, count } of entries) {
    if (count <= 0) continue
    try {
      const usageRows = await ctx.apiKeyUsageService.recordUsage(apiKeyConsumerId, channel, count)
      results.push(
        ...usageRows.map(({ periodTypeCode, periodStart, sentCount }) => ({
          channelCode: channel,
          periodTypeCode,
          periodStart,
          sentCount,
        })),
      )
    } catch (error) {
      logger.warn(
        `Failed to record ${channel} usage for API key ${apiKeyConsumerId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }
  return results
}

async function processLimitAlerts(
  ctx: QueueableContext,
  apiKeyConsumerId: string | undefined,
  usageResults: AcceptedUsageResult[],
): Promise<void> {
  if (!apiKeyConsumerId || usageResults.length === 0 || !ctx.limitAlertNotificationService) {
    return
  }

  try {
    await ctx.limitAlertNotificationService.processAcceptedUsage({
      apiKeyConsumerId,
      usageResults,
    })
  } catch (error) {
    const logger = new Logger('Queueable[limit-alerts]')
    logger.warn(
      `Failed to process usage limit alerts: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
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
 * Every external contact point a request would reach: email to/cc/bcc and SMS to.
 *
 * cc and bcc are included deliberately. A blocked address hidden in bcc reaches a real person
 * exactly as a `to` does, so leaving them out would make the guardrail one header away from
 * being bypassed. msgApp is excluded: it delivers inside the application, not to a contact point.
 */
function collectSafelistCandidates(
  payload: NotifySimpleRequest | ProcessedNotifySimpleRequest,
): SafelistCandidate[] {
  const candidates: SafelistCandidate[] = []
  const email = payload.email?.recipients
  for (const address of [...(email?.to ?? []), ...(email?.cc ?? []), ...(email?.bcc ?? [])]) {
    candidates.push({ address, channel: NotificationChannel.EMAIL })
  }
  for (const address of payload.sms?.recipients?.to ?? []) {
    candidates.push({ address, channel: NotificationChannel.SMS })
  }
  return candidates
}

/** The 400 raised when a send would reach a recipient the tenant has not safelisted. */
function safelistRejection(blocked: string[]): BadRequestException {
  return new BadRequestException({
    message: 'Request validation failed',
    errors: [
      `Recipient(s) not on this tenant's safelist: ${blocked.join(', ')}. This environment only ` +
        'sends to safelisted recipients.  You can safelist recipients by adding them under Settings.',
    ],
  })
}

/**
 * Reject a send that would reach any non-safelisted recipient. A no-op when the safelist is not
 * enforced in this environment (always the case in PROD) or the service is not wired in.
 *
 * Any blocked recipient fails the whole request rather than being quietly stripped: dropping one
 * address from a multi-recipient send would change what the caller asked for without telling them.
 */
async function enforceSafelist(
  ctx: QueueableContext,
  tenantId: string,
  payload: NotifySimpleRequest | ProcessedNotifySimpleRequest,
): Promise<void> {
  if (!ctx.safelistService) return

  const blocked = await ctx.safelistService.findBlocked(
    tenantId,
    collectSafelistCandidates(payload),
  )
  if (blocked.length > 0) {
    // Count only — recipient values are not logged.
    new Logger('Queueable[safelist]').warn(
      `Rejected send: ${blocked.length} recipient(s) not safelisted (tenant=${tenantId})`,
    )
    throw safelistRejection(blocked)
  }
}

/**
 * Map a NotificationChannel to the NotifySimpleRequest property key used to wrap a bare
 * single-channel route body.
 */
function channelKey(channel: NotificationChannel): 'email' | 'sms' {
  return channel === NotificationChannel.SMS ? 'sms' : 'email'
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
 * Detect a mail-merge email payload: an email channel whose recipients use `mergeArray`. The global
 * ValidationPipe has already validated the body, so the presence of `email.recipients.mergeArray` is
 * sufficient to route the request through the mail merge fan-out flow.
 */
function mergeRequestChannel(payload: unknown): NotificationChannel | null {
  const request = payload as NotifySimpleRequest | undefined
  if (Array.isArray(request?.email?.recipients?.mergeArray)) return NotificationChannel.EMAIL
  if (Array.isArray(request?.sms?.recipients?.mergeArray)) return NotificationChannel.SMS
  return null
}

/**
 * Billable message count for a merge.
 *
 * Email is one message per recipient. SMS is billed in segments and every recipient of a merge
 * receives a *different* body, so the count is the sum of each recipient's own segments - not
 * recipients x segments, which is only exact when every body is identical.
 */
async function countMergeMessages(
  ctx: QueueableContext,
  tenantId: string,
  channel: NotificationChannel,
  dto: NotifySimpleRequest,
  recipients: Array<{ address: string; params: Record<string, unknown> }>,
  globalParams: Record<string, unknown>,
): Promise<number> {
  if (channel !== NotificationChannel.SMS) {
    return recipients.length
  }

  let total = 0
  for (const recipient of recipients) {
    // Each row is costed against its own rendered body; per-recipient params win over global ones,
    // matching how the delivery worker renders it.
    const perRecipient: NotifySimpleRequest = {
      ...dto,
      sms: {
        ...dto.sms!,
        recipients: { to: [recipient.address] },
        params: { ...globalParams, ...recipient.params },
      },
    } as NotifySimpleRequest

    total += await resolveSmsSegments(ctx, tenantId, perRecipient as never)
  }

  return total
}

/**
 * Handle an email merge request: validate, persist the parent request, and enqueue ONE ingestion job
 * carrying every recipient address plus the global params. The ingestion worker fans this out into
 * per-batch delivery jobs (and creates the per-recipient detail rows), so this does not call
 * createPending here.
 */
async function handleMerge(
  ctx: QueueableContext,
  queue: Bull.Queue,
  queueName: QueueName,
  tenantId: string,
  dto: NotifySimpleRequest,
  apiKeyConsumerId: string | undefined,
  requestRoute: string | undefined,
  channel: NotificationChannel,
) {
  const isSms = channel === NotificationChannel.SMS
  const logger = new Logger(`Queueable[${queueName}][${isSms ? 'smsMerge' : 'emailMerge'}]`)

  const channelPayload = (isSms ? dto.sms : dto.email)!
  const mergeArray = channelPayload.recipients.mergeArray!
  const delayedSendTimestamp = channelPayload.delayedSend
  // Global params cascade: request-level params augmented/overridden by channel-level params
  const globalParams = { ...dto.params, ...channelPayload.params }

  const errors = await ctx.notificationService.validateMailMergeRules(tenantId, dto, channel)
  if (errors.length > 0) {
    throw new UnprocessableEntityException({ message: 'Request validation failed', errors })
  }

  const allRecipients = ctx.notificationService.parseMailMergeRecipients(mergeArray, channel)

  // Non-production guardrail. A merge is a list of independent sends, so non-safelisted rows are
  // dropped from the fan-out and recorded individually as `blocked` instead of failing the whole
  // request — unless every recipient is blocked, in which case there is nothing left to send.
  const blockedAddresses = ctx.safelistService
    ? await ctx.safelistService.findBlocked(
        tenantId,
        allRecipients.map(({ address }) => ({ address, channel })),
      )
    : []
  const blockedSet = new Set(blockedAddresses)
  const recipients = allRecipients.filter(({ address }) => !blockedSet.has(address))

  // Guarded on blockedSet so an otherwise-empty merge still fails validateMailMergeRules'
  // own way rather than being reported as a safelist rejection.
  if (recipients.length === 0 && blockedSet.size > 0) {
    throw safelistRejection(blockedAddresses)
  }
  if (blockedSet.size > 0) {
    // Count only — recipient values are not logged.
    logger.warn(
      `Mail merge: ${blockedSet.size} of ${allRecipients.length} recipient(s) not safelisted (tenant=${tenantId})`,
    )
  }

  // Billable count, before accepting the request. For SMS this renders every row, because each
  // recipient's body - and therefore its segment count - differs.
  const messageCount = await countMergeMessages(
    ctx,
    tenantId,
    channel,
    dto,
    recipients,
    globalParams,
  )
  if (isSms && messageCount > recipients.length) {
    logger.debug(
      `SMS merge: ${recipients.length} recipient(s) bill as ${messageCount} segment(s) (tenant=${tenantId})`,
    )
  }

  // Enforce daily/annual limits BEFORE accepting the merge request (throws HTTP 429).
  await enforceLimits(ctx, apiKeyConsumerId, [{ channel, count: messageCount }])

  // Persist the parent request (PENDING) for durability before queuing
  const notificationRecord = await ctx.notificationService.create({
    tenantId,
    status: NotificationStatus.PENDING,
    createdBy: tenantId,
    payload: dto as any,
    requestRoute,
  })
  logger.debug(
    `${isSms ? 'SMS' : 'Email'} merge notification record created with PENDING status: ${notificationRecord.id} (tenant=${tenantId}, recipients=${recipients.length})`,
  )

  // Record the dropped recipients so "why didn't this one arrive?" is answerable from the
  // notification's detail view. Non-fatal: the accepted recipients still go out if this fails.
  if (blockedSet.size > 0 && ctx.notificationRequestDetailService) {
    try {
      await ctx.notificationRequestDetailService.createBlocked(
        notificationRecord.id,
        // blockedSet, not blockedAddresses: a merge can list the same address on several rows.
        [...blockedSet].map((address) => ({ address, channel })),
        'Recipient is not on the tenant safelist',
        tenantId,
      )
    } catch (error) {
      logger.warn(
        `Failed to record blocked mail merge recipients for ${notificationRecord.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  // Attribute the accepted merge against the API key's usage limits (non-fatal). SMS is recorded
  // in segments, matching what was enforced above.
  const usageResults = await recordAcceptedUsage(ctx, apiKeyConsumerId, [
    { channel, count: messageCount },
  ])
  await processLimitAlerts(ctx, apiKeyConsumerId, usageResults)

  // Publish initial record to SSE subscribers (fire-and-forget), matching the simple flow
  const updateSvc = ctx.notificationPubSubService
  if (updateSvc) {
    updateSvc
      .publish(tenantId, {
        id: notificationRecord.id,
        tenantId: notificationRecord.tenantId,
        status: notificationRecord.statusCode
          ? {
              code: notificationRecord.statusCode.code,
              displayName: notificationRecord.statusCode.displayName,
              description: notificationRecord.statusCode.description,
            }
          : { code: notificationRecord.status, displayName: notificationRecord.status },
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
        logger.error('Failed to publish SSE event on merge create', { error: err.message }),
      )
  }

  // Determine if this is a delayed send and calculate the delay in milliseconds
  let delayMs = 0
  if (delayedSendTimestamp) {
    delayMs = Math.max(0, new Date(delayedSendTimestamp).getTime() - Date.now())
  }
  const hasDelayedSend = !!delayedSendTimestamp

  const label = isSms ? 'SMS merge' : 'Email merge'
  const response = {
    notifyId: notificationRecord.id,
    templateId: channelPayload.content?.templateId,
    status: hasDelayedSend ? NotificationStatus.SCHEDULED : NotificationStatus.ACCEPTED,
    channels: [isSms ? 'sms' : 'email'],
    createdAt: notificationRecord.createdAt || new Date(),
    // Accepted recipients only - safelist-blocked rows are reported separately below, so a caller
    // can tell "242 queued" from "250 rows uploaded" without parsing the message string.
    recipientCount: recipients.length,
    // SMS only: recipients are billed in segments, so this can exceed recipientCount.
    ...(isSms && { billableMessageCount: messageCount }),
    message: hasDelayedSend
      ? `${label} send scheduled for delivery at ${delayedSendTimestamp} with ${recipients.length} recipient(s)`
      : `${label} send accepted with ${recipients.length} recipient(s)`,
    ...(blockedSet.size > 0 && {
      blockedRecipientCount: blockedSet.size,
      blockedMessage: `${blockedSet.size} recipient(s) were not sent to because they are not on this tenant's safelist`,
    }),
  }

  // Fire off queueing asynchronously - don't block the response.
  // If queuing fails (e.g. Redis down), the record stays PENDING for the retry job.
  setImmediate(async () => {
    try {
      const jobPayload = {
        notifyId: notificationRecord.id,
        tenantId,
        request: { templateId: channelPayload.content?.templateId },
        requestedAt: new Date().toISOString(),
        mailMerge: true,
        mailMergeChannel: channel,
        mailMergeData: {
          content: channelPayload.content,
          params: globalParams,
          recipients,
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
        `Mail merge ingestion job enqueued: ${notificationRecord.id} (tenant=${tenantId}, queue=${queueName})`,
      )

      // For scheduled sends keep status as SCHEDULED; for immediate sends update to QUEUED
      try {
        await ctx.notificationService.update(notificationRecord.id, tenantId, {
          status: hasDelayedSend ? NotificationStatus.SCHEDULED : NotificationStatus.QUEUED,
          updatedBy: 'system',
        })
      } catch (updateError) {
        logger.error(
          `Failed to update status after queuing mail merge job: ${notificationRecord.id}`,
          {
            tenantId,
            error: (updateError as Error).message,
          },
        )
      }
    } catch (queueError) {
      logger.warn(`Failed to enqueue mail merge job (will be retried): ${notificationRecord.id}`, {
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
 * @param channel - When set, the route body is a bare single-channel payload (e.g. the
 *   /notifysimple/email route posts a NotifyEmailChannel). The decorator wraps it into a
 *   NotifySimpleRequest (`{ [channel]: body }`) so the rest of the pipeline is unchanged.
 */
export function Queueable(
  queueName: QueueName = QueueName.INGESTION,
  channel?: NotificationChannel,
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const logger = new Logger(`Queueable[${queueName}]`)

    descriptor.value = async function (this: QueueableContext, req?: any, body?: unknown) {
      try {
        // For single-channel routes the body is a bare channel; wrap it into a NotifySimpleRequest
        // so detection and downstream processing operate on the standard shape.
        const payload: unknown =
          channel && body && typeof body === 'object' ? { [channelKey(channel)]: body } : body
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
        const requestRoute = extractRequestRoute(req)
        const uploadedBy =
          typeof req?.user?.sub === 'string'
            ? req.user.sub
            : typeof req?.user?.id === 'string'
              ? req.user.id
              : tenantId

        // Email merge send: a different payload/flow that fans out into batches downstream.
        const mergeChannel = mergeRequestChannel(payload)
        if (mergeChannel) {
          return await handleMerge(
            this as QueueableContext,
            queue,
            queueName,
            tenantId,
            payload as NotifySimpleRequest,
            req?.apiKeyConsumerId,
            requestRoute,
            mergeChannel,
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
        // SMS is counted in billable segments: a body over the single-segment budget is sent (and
        // billed by ACS) as several concatenated messages, so one request to one recipient can
        // consume several of the tenant's SMS allowance.
        //
        // INVARIANT: every SMS recipient of a request receives the same body — the SMS channel has
        // one content block and one params set, and mail merge is email-only (NotifySmsRecipients
        // has no mergeArray). So the segment count is uniform and recipients x segments is exact.
        // If per-recipient SMS personalisation is ever added, this must become a per-recipient sum.
        const smsRecipientCount = processedPayload.sms?.recipients?.to?.length ?? 0
        const smsSegments =
          smsRecipientCount > 0
            ? await resolveSmsSegments(this as QueueableContext, tenantId, processedPayload)
            : 1
        if (smsSegments > 1) {
          logger.debug(
            `SMS body spans ${smsSegments} segments; billing ${smsRecipientCount} recipient(s) as ${
              smsRecipientCount * smsSegments
            } message(s) (tenant=${tenantId})`,
          )
        }

        const usageEntries = [
          {
            channel: NotificationChannel.EMAIL,
            count: processedPayload.email?.recipients?.to?.length ?? 0,
          },
          {
            channel: NotificationChannel.SMS,
            count: smsRecipientCount * smsSegments,
            // Explains a 429 when a short-looking request costs several messages.
            countExplanation:
              smsSegments > 1
                ? `${smsRecipientCount} recipient(s) x ${smsSegments} segments, ` +
                  `because the message is too long to send as one SMS`
                : undefined,
          },
        ]

        // Non-production guardrail: reject the request outright if it would reach a recipient
        // this tenant has not safelisted. Runs before anything is persisted, queued or counted
        // against the API key's limits.
        await enforceSafelist(this as QueueableContext, tenantId, processedPayload)

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
            requestRoute,
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
                status: notificationRecord.statusCode
                  ? {
                      code: notificationRecord.statusCode.code,
                      displayName: notificationRecord.statusCode.displayName,
                      description: notificationRecord.statusCode.description,
                    }
                  : { code: notificationRecord.status, displayName: notificationRecord.status },
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
        const usageResults = await recordAcceptedUsage(
          this as QueueableContext,
          req?.apiKeyConsumerId,
          usageEntries,
        )
        await processLimitAlerts(this as QueueableContext, req?.apiKeyConsumerId, usageResults)

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
