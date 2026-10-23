import {
  Inject,
  Injectable,
  Logger,
  Optional,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common'
import type { Queue } from 'bullmq'
import { NotificationStatus } from '../../../enum/notification-status.enum'
import { QueueName } from '../../../enum/queue-name.enum'
import { NotificationChannel } from '../../../enum/notification-channel.enum'
import { NotificationService } from '../../notification/notification.service'
import { NotificationRequestDetailService } from '../../notification/notification-request-detail.service'
import { ApiKeyUsageService, RecordedUsageResult } from '../../api-keys/api-key-usage.service'
import { SafelistService } from '../../safelist/safelist.service'
import type { SafelistCandidate } from '../../safelist/safelist.service'
import { EventNotificationResolver } from '../../events/event-notification.resolver'
import { NotifySimpleRequest } from '../schemas/notify-simple-request'
import type { ProcessedNotifySimpleRequest } from '../schemas/stored-notify-attachment'
import type { NotifyEventTestSendRequest } from '../schemas/notify-event-send-request'
import type { NotificationAcceptanceResponse } from '../schemas/notification-acceptance-response.dto'
import { AttachmentProcessingService } from './attachment-processing.service'
import { AttachmentValidationService } from './attachment-validation.service'
import { LimitAlertNotificationService } from './limit-alert-notification.service'
import { SmsSegmentService } from './sms-segment.service'
import { NotificationDedupService } from './notification-dedup.service'
import type { DedupClaim, DuplicateNotification } from './notification-dedup.service'
import { extractRequestRoute } from '../../../common/utils/extract-request-route'
import { mergeRequestChannel } from '../../../queue/merge-batch-builder'
import { INGESTION_JOB_OPTIONS } from '../../../queue/job-options'

interface AcceptedUsageResult extends RecordedUsageResult {
  channelCode: string
}

type UsageEntry = { channel: string; count: number; countExplanation?: string }

type MergeRecipient = { address: string; params: Record<string, unknown> }

export type EventSendMode = 'full' | 'test'

export interface SubmitOptions {
  /**
   * Set when the route body is a bare single-channel payload (e.g. /notifysimple/email posts a
   * NotifyEmailChannel). It is wrapped as `{ [channel]: body }` so the rest of the pipeline sees
   * the standard NotifySimpleRequest shape.
   */
  channel?: NotificationChannel
  eventSend?: EventSendMode
}

/** Who is sending, read once from the request so nothing below this needs `req`. */
interface Caller {
  tenantId: string
  tenantExternalId?: string
  apiKeyConsumerId?: string
  requestRoute?: string
  uploadedBy: string
  authHeader?: string
  email?: unknown
}

export interface MergeSubmission {
  tenantId: string
  dto: NotifySimpleRequest
  channel: NotificationChannel
  apiKeyConsumerId?: string
  requestRoute?: string
  eventId?: string
  skipDedup?: boolean
}

/**
 * Accepts a send: dedup, validation, safelist, limits, the durable notification_request row and
 * the ingestion job. Shared by the /notifysimple controllers and the GC Notify compatibility
 * routes so there is one definition of what a send costs and when it is rejected.
 *
 * The request payload has already passed the global ValidationPipe. Queueing happens after the
 * response in `setImmediate`; if Redis is down the row stays PENDING and DeliveryReconcilerService
 * queues it later.
 */
@Injectable()
export class NotifySubmissionService {
  private readonly logger = new Logger(NotifySubmissionService.name)

  constructor(
    private readonly notificationService: NotificationService,
    private readonly attachmentValidationService: AttachmentValidationService,
    private readonly attachmentProcessingService: AttachmentProcessingService,
    private readonly notificationRequestDetailService: NotificationRequestDetailService,
    private readonly apiKeyUsageService: ApiKeyUsageService,
    private readonly safelistService: SafelistService,
    private readonly smsSegmentService: SmsSegmentService,
    private readonly notificationDedupService: NotificationDedupService,
    private readonly eventNotificationResolver: EventNotificationResolver,
    @Inject(QueueName.INGESTION) private readonly ingestionQueue: Queue,
    @Optional() private readonly limitAlertNotificationService?: LimitAlertNotificationService,
  ) {}

  /** Entry point for the /notifysimple send routes. */
  async submit(
    req: any,
    body: unknown,
    options: SubmitOptions = {},
  ): Promise<NotificationAcceptanceResponse> {
    try {
      const caller = this.callerFromRequest(req)
      let payload: unknown =
        options.channel && body && typeof body === 'object'
          ? { [options.channel === NotificationChannel.SMS ? 'sms' : 'email']: body }
          : body

      // A test send is repeated on purpose while the sender and header are adjusted, and those
      // are applied by the delivery worker, so they are not in the fingerprint.
      const skipDedup = options.eventSend === 'test'

      let eventId: string | undefined
      if (options.eventSend) {
        eventId = (payload as { eventId?: string })?.eventId
        payload = await this.resolveEventSend(options.eventSend, payload, caller)
      }

      const mergeChannel = mergeRequestChannel(payload)
      if (mergeChannel) {
        return await this.acceptMerge({
          tenantId: caller.tenantId,
          dto: payload as NotifySimpleRequest,
          channel: mergeChannel,
          apiKeyConsumerId: caller.apiKeyConsumerId,
          requestRoute: caller.requestRoute,
          eventId,
          skipDedup,
        })
      }

      return await this.acceptSimple(caller, payload as NotifySimpleRequest, eventId, skipDedup)
    } catch (error) {
      this.logger.error(`Failed to queue notification`, {
        error: (error as Error).message,
        stack: (error as Error).stack,
      })
      throw error
    }
  }

  /**
   * Accept a mail-merge send: validate, drop non-safelisted rows, persist the parent request and
   * enqueue ONE ingestion job. The ingestion worker fans it out into per-batch delivery jobs and
   * creates the per-recipient detail rows.
   */
  async acceptMerge(submission: MergeSubmission): Promise<NotificationAcceptanceResponse> {
    const { tenantId, dto, channel, apiKeyConsumerId, requestRoute, eventId } = submission
    const isSms = channel === NotificationChannel.SMS
    const channelPayload = (isSms ? dto.sms : dto.email)!
    const channelName = isSms ? 'sms' : 'email'

    // Before validation and segment counting: for a large SMS merge those render every row.
    const { fingerprint, duplicate } = await this.findDuplicateSend(
      tenantId,
      dto,
      submission.skipDedup,
    )
    if (duplicate) return duplicateResponse(duplicate, [channelName])

    // Global params cascade: request-level params augmented/overridden by channel-level params
    const globalParams = { ...dto.params, ...channelPayload.params }

    const errors = await this.notificationService.validateMailMergeRules(tenantId, dto, channel)
    if (errors.length > 0) {
      throw new UnprocessableEntityException({ message: 'Request validation failed', errors })
    }

    const { recipients, blocked, total } = await this.safelistedMergeRecipients(
      tenantId,
      channel,
      channelPayload.recipients.mergeArray!,
    )

    // Billable count, before accepting the request. For SMS this renders every row, because each
    // recipient's body - and therefore its segment count - differs.
    const messageCount = await this.countMergeMessages(
      tenantId,
      channel,
      dto,
      recipients,
      globalParams,
    )
    if (isSms && messageCount > recipients.length) {
      this.logger.debug(
        `SMS merge: ${recipients.length} recipient(s) bill as ${messageCount} segment(s) (tenant=${tenantId})`,
      )
    }

    const usage = [{ channel, count: messageCount }]
    await this.enforceLimits(apiKeyConsumerId, usage)

    const claim = await this.claimSend(tenantId, fingerprint)
    if (claim.kind === 'duplicate') return duplicateResponse(claim.original, [channelName])

    const notificationRecord = await this.createPending(claim, {
      tenantId,
      payload: dto,
      requestRoute,
      // An event merge is still an event send: without this the delivery worker has nothing to
      // read the event's sender and header back from.
      eventId,
    })
    this.logger.debug(
      `${isSms ? 'SMS' : 'Email'} merge notification record created with PENDING status: ${notificationRecord.id} (tenant=${tenantId}, recipients=${recipients.length}, of ${total})`,
    )

    await this.recordBlockedMergeRecipients(notificationRecord.id, tenantId, channel, blocked)

    const usageResults = await this.recordAcceptedUsage(apiKeyConsumerId, usage)
    await this.processLimitAlerts(apiKeyConsumerId, usageResults)

    const delayedSend = channelPayload.delayedSend
    const label = isSms ? 'SMS merge' : 'Email merge'
    const response = {
      notifyId: notificationRecord.id,
      templateId: channelPayload.content?.templateId,
      status: delayedSend ? NotificationStatus.SCHEDULED : NotificationStatus.ACCEPTED,
      channels: [channelName],
      createdAt: notificationRecord.createdAt || new Date(),
      // Accepted recipients only - safelist-blocked rows are reported separately below, so a caller
      // can tell "242 queued" from "250 rows uploaded" without parsing the message string.
      recipientCount: recipients.length,
      // SMS only: recipients are billed in segments, so this can exceed recipientCount.
      ...(isSms && { billableMessageCount: messageCount }),
      message: delayedSend
        ? `${label} send scheduled for delivery at ${delayedSend} with ${recipients.length} recipient(s)`
        : `${label} send accepted with ${recipients.length} recipient(s)`,
      ...(blocked.length > 0 && {
        blockedRecipientCount: blocked.length,
        blockedMessage: `${blocked.length} recipient(s) were not sent to because they are not on this tenant's safelist`,
      }),
    }

    this.enqueueInBackground(notificationRecord.id, tenantId, delayedSend, 'mail merge job', {
      request: { templateId: channelPayload.content?.templateId },
      mailMerge: true,
      mailMergeChannel: channel,
      // Recipients are not carried: ingestion reads them from the request stored above, so a
      // large merge is not held in Redis.
      mailMergeData: { content: channelPayload.content, params: globalParams },
    })

    return response
  }

  /**
   * Fingerprint a send and check it against the dedup window before any expensive work
   * (attachment upload, per-row SMS rendering). Only a hint: `claimSend` makes the decision.
   * `skip` leaves the send unfingerprinted, so `claimSend` lets it through too.
   */
  async findDuplicateSend(
    tenantId: string,
    fingerprintSource: unknown,
    skip = false,
  ): Promise<{ fingerprint?: string; duplicate: DuplicateNotification | null }> {
    const dedup = this.notificationDedupService
    if (skip || !dedup.enabled) return { duplicate: null }
    const fingerprint = dedup.fingerprint(fingerprintSource)
    return { fingerprint, duplicate: await dedup.findDuplicate(tenantId, fingerprint) }
  }

  /**
   * Reserve the notifyId for a send, or learn that an identical one already holds it. Call after
   * every check that can reject the request and immediately before creating the row with
   * `notifyId`; release the claim if that create fails.
   */
  async claimSend(tenantId: string, fingerprint: string | undefined): Promise<DedupClaim> {
    if (!fingerprint) return { kind: 'proceed', release: async () => {} }
    return this.notificationDedupService.claim(tenantId, fingerprint)
  }

  /**
   * Billable segments a single SMS recipient of this request will cost.
   *
   * A message over the single-segment budget is concatenated and every segment is billed as its
   * own message by the carrier, so usage is attributed in segments. Falls back to 1 when the body
   * cannot be resolved — never blocks a send.
   */
  async resolveSmsSegments(
    tenantId: string,
    payload: ProcessedNotifySimpleRequest | NotifySimpleRequest,
  ): Promise<number> {
    try {
      return Math.max(1, await this.smsSegmentService.countSegmentsPerRecipient(tenantId, payload))
    } catch (error) {
      this.logger.warn(
        `Failed to count SMS segments, billing as a single segment: ${errorMessage(error)}`,
      )
      return 1
    }
  }

  /**
   * Enforce the API key's daily/annual limits BEFORE a send is accepted. Throws HTTP 429 if any
   * channel would exceed its limit. Unlike usage recording this is NOT swallowed — a rejected
   * request must fail. Skipped when there is no bound API key.
   */
  async enforceLimits(apiKeyConsumerId: string | undefined, entries: UsageEntry[]): Promise<void> {
    if (!apiKeyConsumerId) return
    await this.apiKeyUsageService.assertWithinLimits(apiKeyConsumerId, entries)
  }

  /**
   * Attribute accepted notifications against the authenticating API key's usage limits.
   * Non-fatal: usage tracking must never block or fail an accepted send. Skipped when the
   * request has no bound API key.
   */
  async recordAcceptedUsage(
    apiKeyConsumerId: string | undefined,
    entries: UsageEntry[],
  ): Promise<AcceptedUsageResult[]> {
    if (!apiKeyConsumerId) return []
    // One entry per channel, and each channel upserts its own rows, so the writes can overlap.
    const perChannel = await Promise.all(
      entries
        .filter(({ count }) => count > 0)
        .map(async ({ channel, count }): Promise<AcceptedUsageResult[]> => {
          try {
            const usageRows = await this.apiKeyUsageService.recordUsage(
              apiKeyConsumerId,
              channel,
              count,
            )
            return usageRows.map(({ periodTypeCode, periodStart, sentCount }) => ({
              channelCode: channel,
              periodTypeCode,
              periodStart,
              sentCount,
            }))
          } catch (error) {
            this.logger.warn(
              `Failed to record ${channel} usage for API key ${apiKeyConsumerId}: ${errorMessage(error)}`,
            )
            return []
          }
        }),
    )
    return perChannel.flat()
  }

  private callerFromRequest(req: any): Caller {
    const tenant = req?.tenant
    if (typeof tenant?.id !== 'string') {
      this.logger.error(
        `Invalid or missing tenant context. req.tenant = ${JSON.stringify(req?.tenant)}`,
      )
      throw new BadRequestException(
        'Tenant information is required but was not provided or invalid',
      )
    }

    const user = req?.user
    let uploadedBy: string = tenant.id
    if (typeof user?.sub === 'string') uploadedBy = user.sub
    else if (typeof user?.id === 'string') uploadedBy = user.id

    return {
      tenantId: tenant.id,
      tenantExternalId: tenant.externalId,
      apiKeyConsumerId: req?.apiKeyConsumerId,
      requestRoute: extractRequestRoute(req),
      uploadedBy,
      authHeader: req?.headers?.authorization,
      email: user?.email,
    }
  }

  /**
   * Expand an event send request into the ordinary request shape. The event id is stored on the
   * notification_request so the delivery worker can add the event's sender and header.
   */
  private async resolveEventSend(
    mode: EventSendMode,
    payload: unknown,
    caller: Caller,
  ): Promise<NotifySimpleRequest> {
    const resolver = this.eventNotificationResolver
    const request = payload as NotifyEventTestSendRequest
    const { tenantId } = caller

    if (mode === 'full') {
      return resolver.resolveSend(tenantId, request.eventId, request.params, {
        tenantId: caller.tenantExternalId,
        authHeader: caller.authHeader,
      })
    }

    // Recipients chosen on the test send screen. The resolver decides which of them are allowed.
    // Merge rows carry a value set per recipient, so each one receives a different message.
    if (request.mergeArray?.length) {
      return resolver.resolveTestSend(tenantId, request.eventId, request.params, {
        mergeArray: request.mergeArray,
      })
    }

    if (request.to?.length) {
      return resolver.resolveTestSend(tenantId, request.eventId, request.params, {
        to: request.to,
      })
    }

    // None given, so the test goes back to whoever asked for it.
    if (typeof caller.email !== 'string' || !caller.email.trim()) {
      throw new BadRequestException(
        'Your account has no email address, so there is nowhere to send a test notification',
      )
    }

    return resolver.resolveTestSend(tenantId, request.eventId, request.params, {
      to: [caller.email],
    })
  }

  private async acceptSimple(
    caller: Caller,
    payload: NotifySimpleRequest,
    eventId: string | undefined,
    skipDedup: boolean,
  ): Promise<NotificationAcceptanceResponse> {
    const { tenantId, apiKeyConsumerId } = caller
    const channels: string[] = []
    if (payload.email) channels.push('email')
    if (payload.sms) channels.push('sms')
    if (payload.msgApp) channels.push('msgApp')

    // Fingerprinted before attachment processing, which stores each file under a new id and
    // would make every request look different. Checked first so a duplicate uploads nothing.
    const { fingerprint, duplicate } = await this.findDuplicateSend(tenantId, payload, skipDedup)
    if (duplicate) return duplicateResponse(duplicate, channels)

    await this.attachmentValidationService.validateAttachments(payload)
    const processed = await this.attachmentProcessingService.processAttachments(
      payload,
      tenantId,
      caller.uploadedBy,
    )

    // Tenant active, recipient counts, content, etc.
    const businessErrors = await this.notificationService.validateBusinessRules(tenantId, processed)
    if (businessErrors.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Request validation failed',
        errors: businessErrors,
      })
    }

    const usage = await this.simpleUsageEntries(tenantId, processed)

    // Non-production guardrail, then limits (HTTP 429): both reject before anything is
    // persisted, queued or counted against the API key.
    await this.enforceSafelist(tenantId, processed)
    await this.enforceLimits(apiKeyConsumerId, usage)

    // Nothing between here and the create can reject the request, so a duplicate handed this
    // claim's notifyId while the row is still being written gets an id that will exist.
    const claim = await this.claimSend(tenantId, fingerprint)
    if (claim.kind === 'duplicate') return duplicateResponse(claim.original, channels)

    // Sanitized payload stored for retry: if Redis is unavailable the reconciler re-queues it.
    const notificationRecord = await this.createPending(claim, {
      tenantId,
      payload: processed,
      requestRoute: caller.requestRoute,
      eventId,
    })
    this.logger.debug(
      `Notification record created in DB with PENDING status: ${notificationRecord.id} (tenant=${tenantId})`,
    )

    const usageResults = await this.recordAcceptedUsage(apiKeyConsumerId, usage)
    await this.processLimitAlerts(apiKeyConsumerId, usageResults)

    const delayedSend =
      processed.email?.delayedSend || processed.sms?.delayedSend || processed.msgApp?.delayedSend

    const response = {
      notifyId: notificationRecord.id,
      status: delayedSend ? NotificationStatus.SCHEDULED : NotificationStatus.ACCEPTED,
      channels: channels.length > 0 ? channels : ['email', 'sms', 'msgApp'],
      createdAt: notificationRecord.createdAt || new Date(),
      message: delayedSend
        ? `Notification scheduled for delivery at ${delayedSend}`
        : 'Notification accepted, queuing in progress',
    }

    this.enqueueInBackground(notificationRecord.id, tenantId, delayedSend, 'job', {
      request: processed,
    })

    return response
  }

  /**
   * Primary (to) recipient count per channel — used for both limit enforcement and usage.
   *
   * SMS is counted in billable segments. INVARIANT: every SMS recipient of a non-merge request
   * receives the same body (one content block, one params set), so recipients x segments is
   * exact. Merges are costed per row in `countMergeMessages`.
   */
  private async simpleUsageEntries(
    tenantId: string,
    payload: ProcessedNotifySimpleRequest,
  ): Promise<UsageEntry[]> {
    const smsRecipients = payload.sms?.recipients?.to?.length ?? 0
    const smsSegments = smsRecipients > 0 ? await this.resolveSmsSegments(tenantId, payload) : 1
    if (smsSegments > 1) {
      this.logger.debug(
        `SMS body spans ${smsSegments} segments; billing ${smsRecipients} recipient(s) as ${
          smsRecipients * smsSegments
        } message(s) (tenant=${tenantId})`,
      )
    }

    return [
      { channel: NotificationChannel.EMAIL, count: payload.email?.recipients?.to?.length ?? 0 },
      {
        channel: NotificationChannel.SMS,
        count: smsRecipients * smsSegments,
        // Explains a 429 when a short-looking request costs several messages.
        countExplanation:
          smsSegments > 1
            ? `${smsRecipients} recipient(s) x ${smsSegments} segments, ` +
              `because the message is too long to send as one SMS`
            : undefined,
      },
    ]
  }

  /**
   * Reject a send that would reach any non-safelisted recipient. A no-op when the safelist is not
   * enforced in this environment (always the case in PROD).
   *
   * Any blocked recipient fails the whole request rather than being quietly stripped: dropping one
   * address from a multi-recipient send would change what the caller asked for without telling them.
   */
  private async enforceSafelist(
    tenantId: string,
    payload: ProcessedNotifySimpleRequest,
  ): Promise<void> {
    const blocked = await this.safelistService.findBlocked(
      tenantId,
      collectSafelistCandidates(payload),
    )
    if (blocked.length > 0) {
      // Count only — recipient values are not logged.
      this.logger.warn(
        `Rejected send: ${blocked.length} recipient(s) not safelisted (tenant=${tenantId})`,
      )
      throw safelistRejection(blocked)
    }
  }

  /**
   * A merge is a list of independent sends, so non-safelisted rows are dropped from the fan-out
   * (and recorded as `blocked`) instead of failing the request — unless every row is blocked, in
   * which case there is nothing left to send.
   */
  private async safelistedMergeRecipients(
    tenantId: string,
    channel: NotificationChannel,
    mergeArray: string[][],
  ): Promise<{ recipients: MergeRecipient[]; blocked: string[]; total: number }> {
    const all = this.notificationService.parseMailMergeRecipients(mergeArray, channel)
    const blockedAddresses = await this.safelistService.findBlocked(
      tenantId,
      all.map(({ address }) => ({ address, channel })),
    )
    // Deduplicated: a merge can list the same address on several rows.
    const blocked = [...new Set(blockedAddresses)]
    const blockedSet = new Set(blocked)
    const recipients = all.filter(({ address }) => !blockedSet.has(address))

    // Guarded on `blocked` so an otherwise-empty merge still fails validateMailMergeRules'
    // own way rather than being reported as a safelist rejection.
    if (recipients.length === 0 && blocked.length > 0) {
      throw safelistRejection(blockedAddresses)
    }
    if (blocked.length > 0) {
      // Count only — recipient values are not logged.
      this.logger.warn(
        `Mail merge: ${blocked.length} of ${all.length} recipient(s) not safelisted (tenant=${tenantId})`,
      )
    }
    return { recipients, blocked, total: all.length }
  }

  /**
   * Record the dropped recipients so "why didn't this one arrive?" is answerable from the
   * notification's detail view. Non-fatal: the accepted recipients still go out if this fails.
   */
  private async recordBlockedMergeRecipients(
    notifyId: string,
    tenantId: string,
    channel: NotificationChannel,
    blocked: string[],
  ): Promise<void> {
    if (blocked.length === 0) return
    try {
      await this.notificationRequestDetailService.createBlocked(
        notifyId,
        blocked.map((address) => ({ address, channel })),
        'Recipient is not on the tenant safelist',
        tenantId,
      )
    } catch (error) {
      this.logger.warn(
        `Failed to record blocked mail merge recipients for ${notifyId}: ${errorMessage(error)}`,
      )
    }
  }

  /**
   * Billable message count for a merge.
   *
   * Email is one message per recipient. SMS is billed in segments and every recipient of a merge
   * receives a *different* body, so the count is the sum of each recipient's own segments - not
   * recipients x segments, which is only exact when every body is identical.
   */
  private async countMergeMessages(
    tenantId: string,
    channel: NotificationChannel,
    dto: NotifySimpleRequest,
    recipients: MergeRecipient[],
    globalParams: Record<string, unknown>,
  ): Promise<number> {
    if (channel !== NotificationChannel.SMS) return recipients.length

    let total = 0
    for (const recipient of recipients) {
      // Per-recipient params win over global ones, matching how the delivery worker renders it.
      const perRecipient = {
        ...dto,
        sms: {
          ...dto.sms!,
          recipients: { to: [recipient.address] },
          params: { ...globalParams, ...recipient.params },
        },
      } as NotifySimpleRequest
      // Sequential on purpose: a template merge looks the template up once per row, and a merge can
      // have 50,000 rows - in parallel that would be 50,000 concurrent queries on the pool.
      total += await this.resolveSmsSegments(tenantId, perRecipient) // NOSONAR
    }
    return total
  }

  private async processLimitAlerts(
    apiKeyConsumerId: string | undefined,
    usageResults: AcceptedUsageResult[],
  ): Promise<void> {
    if (!apiKeyConsumerId || usageResults.length === 0 || !this.limitAlertNotificationService) {
      return
    }
    try {
      await this.limitAlertNotificationService.processAcceptedUsage({
        apiKeyConsumerId,
        usageResults,
      })
    } catch (error) {
      this.logger.warn(`Failed to process usage limit alerts: ${errorMessage(error)}`)
    }
  }

  /** Create the PENDING row under the claimed notifyId, releasing the claim if the create fails. */
  private async createPending(
    claim: DedupClaim & { kind: 'proceed' },
    record: {
      tenantId: string
      payload: NotifySimpleRequest | ProcessedNotifySimpleRequest
      requestRoute?: string
      eventId?: string
    },
  ) {
    try {
      return await this.notificationService.create({
        ...(claim.notifyId && { id: claim.notifyId }),
        tenantId: record.tenantId,
        status: NotificationStatus.PENDING,
        createdBy: record.tenantId,
        payload: record.payload as any,
        requestRoute: record.requestRoute,
        eventId: record.eventId,
      })
    } catch (error) {
      this.logger.error(`Failed to create notification record`, {
        tenantId: record.tenantId,
        error: (error as Error).message,
      })
      await claim.release()
      throw error
    }
  }

  /**
   * Enqueue the ingestion job after the response is sent. On success the row moves to QUEUED
   * (or stays SCHEDULED); on failure it stays PENDING for DeliveryReconcilerService.
   */
  private enqueueInBackground(
    notifyId: string,
    tenantId: string,
    delayedSend: string | undefined,
    label: string,
    job: Record<string, unknown>,
  ): void {
    const delayMs = delayedSend ? Math.max(0, new Date(delayedSend).getTime() - Date.now()) : 0
    const queue = this.ingestionQueue

    setImmediate(async () => {
      try {
        await queue.add(
          queue.name,
          {
            notifyId,
            tenantId,
            ...job,
            requestedAt: new Date().toISOString(),
            ...(delayedSend && { scheduledFor: delayedSend }),
          },
          {
            jobId: notifyId,
            ...INGESTION_JOB_OPTIONS,
            ...(delayMs > 0 && { delay: delayMs }),
          },
        )
        this.logger.log(
          `Ingestion ${label} enqueued: ${notifyId} (tenant=${tenantId}, queue=${queue.name})`,
        )
      } catch (queueError) {
        this.logger.warn(`Failed to enqueue ${label} (will be retried): ${notifyId}`, {
          tenantId,
          error: (queueError as Error).message,
          errorStack: (queueError as Error).stack,
        })
        return
      }

      try {
        await this.notificationService.update(notifyId, tenantId, {
          status: delayedSend ? NotificationStatus.SCHEDULED : NotificationStatus.QUEUED,
          updatedBy: 'system',
        })
      } catch (updateError) {
        this.logger.error(`Failed to update status after queuing ${label}: ${notifyId}`, {
          tenantId,
          error: (updateError as Error).message,
        })
      }
    })
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error) ?? 'Unknown error'
  } catch {
    // Circular, or holds a BigInt.
    return 'Unknown error'
  }
}

/**
 * The 202 for a request identical to one already accepted in the window. Nothing new is
 * persisted, queued or counted against the API key; the caller gets the original's id.
 */
function duplicateResponse(
  original: DuplicateNotification,
  requestedChannels: string[],
): NotificationAcceptanceResponse {
  return {
    notifyId: original.notifyId,
    // A status code read back from the original's row.
    status: original.status as NotificationStatus,
    channels: original.channels?.length ? original.channels : requestedChannels,
    createdAt: original.createdAt,
    duplicate: true,
    message:
      'An identical notification was already accepted; returning the original request instead ' +
      'of sending again',
  }
}

/**
 * Every external contact point a request would reach: email to/cc/bcc and SMS to.
 *
 * cc and bcc are included deliberately. A blocked address hidden in bcc reaches a real person
 * exactly as a `to` does, so leaving them out would make the guardrail one header away from
 * being bypassed. msgApp is excluded: it delivers inside the application, not to a contact point.
 */
function collectSafelistCandidates(payload: ProcessedNotifySimpleRequest): SafelistCandidate[] {
  const email = payload.email?.recipients
  return [
    ...[...(email?.to ?? []), ...(email?.cc ?? []), ...(email?.bcc ?? [])].map((address) => ({
      address,
      channel: NotificationChannel.EMAIL,
    })),
    ...(payload.sms?.recipients?.to ?? []).map((address) => ({
      address,
      channel: NotificationChannel.SMS,
    })),
  ]
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
