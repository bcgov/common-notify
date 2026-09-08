import { BadRequestException, HttpException, Logger, NotFoundException } from '@nestjs/common'
import Bull from 'bull'
import { ConfigService } from '@nestjs/config'
import { DeliveryJobPayload, MailMergeJobData } from '../queue.types'
import { NotificationService } from '../../api/notification/notification.service'
import { NotificationRequestDetailService } from '../../api/notification/notification-request-detail.service'
import { TemplatesRepository } from '../../api/templates/templates.repository'
import { TemplatesService } from '../../api/templates/templates.service'
import { InlineRenderingService } from '../../services/rendering/inline-rendering.service'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { ISmsTransport, SmsRecipientResult } from '../../adapters'
import { StructuredLoggerService } from '../../common/logger'
import { PhoneNumberService } from '../../api/notify/services/phone-number.service'

/**
 * SMS Delivery Worker
 *
 * Processes SMS delivery jobs:
 * 1. Receives SMS delivery jobs from the SMS_DELIVERY queue
 * 2. Updates notification status to SENDING in database
 * 3. Gets the appropriate adapter (future: GC Notify, Twilio, etc)
 * 4. Sends SMS via adapter
 * 5. Updates notification status to COMPLETED on success, FAILED on error
 * 6. Implements retry logic with exponential backoff
 *
 * Idempotency: Job key is notifyId_sms, preventing duplicate delivery
 * Tracing: All operations logged with notifyId for end-to-end visibility
 */
export class SmsDeliveryWorker {
  private readonly logger = new Logger(SmsDeliveryWorker.name)
  private static readonly phoneNumberService = new PhoneNumberService()

  private static isPermanentValidationError(error: unknown): error is HttpException {
    return error instanceof HttpException && error.getStatus() === 400
  }

  /**
   * Initialize the SMS delivery worker on a queue
   * @param smsQueue The BullMQ queue instance for SMS delivery jobs
   * @param notificationService Service for database updates
   * @param configService Configuration service for queue settings
   * @param templatesRepository Repository for template resolution
   * @param templatesService Service for template rendering
   * @param inlineRenderingService Service for inline template rendering
   * @param smsAdapter SMS transport adapter for sending SMS messages
   * @param concurrency Number of jobs to process in parallel (default: 2)
   */
  static async initialize(
    smsQueue: Bull.Queue<DeliveryJobPayload>,
    notificationService: NotificationService,
    configService: ConfigService,
    templatesRepository: TemplatesRepository,
    templatesService: TemplatesService,
    inlineRenderingService: InlineRenderingService,
    smsAdapter: ISmsTransport,
    requestDetailService: NotificationRequestDetailService,
    concurrency: number = 2,
    structuredLogger?: StructuredLoggerService,
  ): Promise<void> {
    const logger = new Logger(SmsDeliveryWorker.name)
    const workerContext = SmsDeliveryWorker.name

    logger.log(`Registering SMS delivery worker processor (concurrency=${concurrency})`)

    // Register the job processor with configurable concurrency
    // Note: Don't await process() - it sets up listeners and never resolves
    smsQueue.process(concurrency, async (job: Bull.Job<DeliveryJobPayload>) => {
      const { notifyId, tenantId, payload, request } = job.data
      const startedAt = Date.now()

      logger.debug(`[${notifyId}] Processing SMS delivery job for tenant=${tenantId}`)

      try {
        // Validate DeliveryJobPayload structure
        if (!notifyId || typeof notifyId !== 'string') {
          throw new Error('Invalid delivery job: notifyId is missing or invalid')
        }
        if (!tenantId || typeof tenantId !== 'string') {
          throw new Error('Invalid delivery job: tenantId is missing or invalid')
        }

        // Emit a structured lifecycle "start" event.
        structuredLogger?.logNotificationStart(notifyId, tenantId, 'sms', workerContext)

        // A merge batch carries its recipients in mailMergeData, not a single payload: each one
        // gets its own rendered body, so they are sent individually below.
        if (job.data.mailMerge && job.data.mailMergeData && job.data.batchId) {
          return await SmsDeliveryWorker.processMergeBatch(
            job.data.batchId,
            job.data.mailMergeData,
            notifyId,
            tenantId,
            logger,
            templatesRepository,
            templatesService,
            inlineRenderingService,
            smsAdapter,
            requestDetailService,
            notificationService,
          )
        }

        // Validate job data
        if (!payload || typeof payload !== 'object') {
          throw new Error('Invalid delivery job: SMS payload is missing or invalid')
        }

        if (
          !payload.recipients ||
          !payload.recipients.to ||
          !Array.isArray(payload.recipients.to) ||
          payload.recipients.to.length === 0
        ) {
          throw new Error('Invalid SMS payload: recipient phone number is missing or invalid')
        }

        const invalidRecipientIndex = payload.recipients.to.findIndex(
          (recipient) => !SmsDeliveryWorker.phoneNumberService.isValid(recipient),
        )
        if (invalidRecipientIndex !== -1) {
          throw new BadRequestException(
            `Invalid SMS payload: recipient phone number at index ${invalidRecipientIndex} is not valid E.164`,
          )
        }

        if ((job.attemptsMade ?? 0) > 0) {
          await requestDetailService.resetForRetry(notifyId)
        }

        let resolvedPayload = payload
        const smsTemplateId = payload.content?.templateId
        if (
          !smsTemplateId &&
          (!payload.content?.body || typeof payload.content.body !== 'string')
        ) {
          throw new Error('Invalid SMS payload: body is missing or invalid')
        }

        if (smsTemplateId) {
          logger.debug(`[${notifyId}] Resolving template: ${smsTemplateId}`)
          try {
            const template = await templatesRepository.findById(tenantId, smsTemplateId)
            if (!template) {
              throw new NotFoundException(
                `Template '${smsTemplateId}' not found for tenant '${tenantId}'`,
              )
            }

            // Merge template content into SMS payload if channel matches
            if (template.channelCode === 'SMS') {
              // Render the template with personalisation data from request.params.
              // SMS always renders as plain text, so no bodyType override applies here.
              const rendered = await templatesService.renderTemplateContent(template, {
                ...request?.params,
                ...payload.params,
              })

              resolvedPayload = {
                ...payload,
                content: {
                  ...payload.content,
                  body: rendered.body,
                  bodyType: rendered.bodyType,
                },
              }
              logger.debug(`[${notifyId}] Template resolved and rendered into SMS payload`)
            }
          } catch (templateError) {
            logger.error(
              `[${notifyId}] Failed to resolve template: ${(templateError as Error).message}`,
            )
            throw templateError
          }
        } else if (payload.content?.renderer) {
          // Handle inline rendering if renderer is specified and no templateId
          logger.debug(
            `[${notifyId}] Rendering inline content with renderer: ${payload.content.renderer}`,
          )
          try {
            const rendered = await inlineRenderingService.renderSms(payload.content, {
              ...request?.params,
              ...payload.params,
            })

            resolvedPayload = {
              ...payload,
              content: {
                ...payload.content,
                body: rendered.body,
              },
            }
            logger.debug(`[${notifyId}] Inline content rendered successfully`)
          } catch (renderError) {
            logger.error(
              `[${notifyId}] Failed to render inline content: ${(renderError as Error).message}`,
            )
            throw renderError
          }
        }

        if (!resolvedPayload.content?.body || typeof resolvedPayload.content.body !== 'string') {
          throw new Error('Invalid SMS payload: body is missing or invalid')
        }

        // Update status to SENDING
        await notificationService.update(notifyId, tenantId, {
          status: NotificationStatus.SENDING,
          updatedBy: 'system',
        })
        await requestDetailService.updateStatus(notifyId, NotificationStatus.SENDING)
        logger.debug(`[${notifyId}] Updated notification status to SENDING`)

        // Send SMS using the injected adapter
        const result = await SmsDeliveryWorker.sendSmsViaAdapter(
          resolvedPayload,
          logger,
          notifyId,
          smsAdapter,
        )

        logger.debug(`[${notifyId}] SMS sent: ${result.providerResponse ?? ''}`)

        // A transport that reports per recipient gets each outcome recorded on its own row, so a
        // partial failure is visible and - crucially - the successes are not repeated by a retry.
        // A transport that cannot (or a send that wholly succeeded) is still all-or-nothing.
        let finalStatus = NotificationStatus.COMPLETED
        if (result.results && result.results.length > 0) {
          for (const recipient of result.results) {
            if (recipient.success) {
              await requestDetailService.markRecipientSent(
                notifyId,
                null,
                recipient.to,
                recipient.messageId,
              )
            } else {
              await requestDetailService.markRecipientFailed(
                notifyId,
                null,
                recipient.to,
                recipient.error ?? 'Send failed',
              )
            }
          }

          const failedCount = result.results.filter((recipient) => !recipient.success).length
          if (failedCount > 0) {
            finalStatus = NotificationStatus.PARTIALLY_COMPLETED
            logger.warn(
              `[${notifyId}] SMS partially delivered: ${failedCount} of ${result.results.length} recipient(s) failed`,
            )
          }
        } else {
          // Request has made it to the sms gateway, update request detail records as sent
          await requestDetailService.markSent(notifyId, result.externalId)
        }

        await notificationService.update(notifyId, tenantId, {
          status: finalStatus,
          updatedBy: 'system',
        })
        logger.log(`[${notifyId}] Notification marked as ${finalStatus.toUpperCase()}`)
        structuredLogger?.logNotificationSuccess(
          notifyId,
          tenantId,
          'sms',
          result.externalId,
          Date.now() - startedAt,
          workerContext,
        )

        return { success: true, externalId: result.externalId, provider: result.provider }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const attempt = (job.attemptsMade || 0) + 1
        logger.error(
          `[${notifyId}] Failed to send SMS delivery job (attempt ${attempt}/3): ${errorMessage}`,
          error instanceof Error ? error.stack : '',
        )

        if (SmsDeliveryWorker.isPermanentValidationError(error)) {
          await notificationService.update(notifyId, tenantId, {
            status: NotificationStatus.FAILED,
            updatedBy: 'system',
            errorReason: errorMessage,
          })
          await requestDetailService.markFailed(notifyId, errorMessage)
          job.discard()
          logger.error(
            `[${notifyId}] Notification marked as FAILED after permanent validation error. Error: ${errorMessage}`,
          )
          throw error
        }

        // Update status to FAILED only on final attempt (when no retries left)
        if ((job.attemptsMade || 0) >= (job.opts.attempts || 3) - 1) {
          await notificationService.update(notifyId, tenantId, {
            status: NotificationStatus.FAILED,
            updatedBy: 'system',
            errorReason: errorMessage,
          })
          await requestDetailService.markFailed(notifyId, errorMessage)
          logger.error(
            `[${notifyId}] Notification marked as FAILED after 3 attempts. Error: ${errorMessage}`,
          )
          structuredLogger?.logNotificationFailure(
            notifyId,
            tenantId,
            'sms',
            error instanceof Error ? error : errorMessage,
            Date.now() - startedAt,
            workerContext,
          )
        }

        // Re-throw to trigger BullMQ retry logic
        throw error
      }
    })

    // Event listeners for job lifecycle
    smsQueue.on('completed', (job: Bull.Job<DeliveryJobPayload>) => {
      const { notifyId } = job.data
      logger.debug(`[${notifyId}] SMS delivery job completed`)
      structuredLogger?.logQueueOperation('complete', smsQueue.name, job.id?.toString(), notifyId, {
        channel: 'sms',
        context: workerContext,
      })
    })

    smsQueue.on('failed', (job: Bull.Job<DeliveryJobPayload>, err: Error) => {
      const { notifyId } = job.data
      logger.error(
        `[${notifyId}] SMS delivery job failed (attempt ${job.attemptsMade}/${job.opts.attempts}): error=${err.message}`,
      )
      structuredLogger?.logQueueOperation('failed', smsQueue.name, job.id?.toString(), notifyId, {
        channel: 'sms',
        context: workerContext,
        error: err.message,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts.attempts,
      })
    })

    logger.log('SMS delivery worker initialized')
  }

  /**
   * Send SMS via adapter
   * @param payload SMS payload
   * @param logger Logger instance
   * @param notifyId Notification ID for tracing
   * @param smsAdapter SMS transport adapter
   * @returns Promise with send result
   */
  /**
   * Send one batch of a merge: render each recipient's body from their own params and send it.
   *
   * A failed recipient is recorded and skipped rather than throwing, so one bad row cannot strand
   * the addresses already delivered in this batch; only systemic errors (a missing template) throw
   * to trigger a retry of the whole batch.
   */
  private static async processMergeBatch(
    batchId: string,
    mailMergeData: MailMergeJobData,
    notifyId: string,
    tenantId: string,
    logger: Logger,
    templatesRepository: TemplatesRepository,
    templatesService: TemplatesService,
    inlineRenderingService: InlineRenderingService,
    smsAdapter: ISmsTransport,
    requestDetailService: NotificationRequestDetailService,
    notificationService: NotificationService,
  ): Promise<{ success: boolean; batchId: string; sent: number; failed: number }> {
    const { content, params, recipients } = mailMergeData
    const templateId = content?.templateId
    const hasInlineContent = !!content?.body

    // A merge renders from exactly one source: a server template or inline content.
    if (templateId && hasInlineContent) {
      throw new Error('SMS merge requires either a templateId or inline content, not both')
    }
    if (!templateId && !hasInlineContent) {
      throw new Error('SMS merge requires either a templateId or inline content')
    }

    const template = templateId ? await templatesRepository.findById(tenantId, templateId) : null
    if (templateId) {
      if (!template) {
        throw new NotFoundException(`Template '${templateId}' not found for tenant '${tenantId}'`)
      }
      if (template.channelCode !== 'SMS') {
        throw new Error(`Template '${templateId}' is not an SMS template`)
      }
    }

    // Inline content defaults to handlebars so per-recipient variables are substituted.
    const inlineContent = content
      ? { ...content, renderer: content.renderer ?? ('handlebars' as const) }
      : null

    logger.debug(
      `[${notifyId}] Processing SMS merge batch ${batchId}: ${recipients.length} recipient(s)`,
    )

    let sent = 0
    let failed = 0

    for (const recipient of recipients) {
      try {
        // Per-recipient params take precedence over the global ones.
        const mergedParams = { ...(params || {}), ...recipient.params }

        const body = template
          ? (await templatesService.renderTemplateContent(template, mergedParams)).body
          : (await inlineRenderingService.renderSms(inlineContent!, mergedParams)).body

        const result = await SmsDeliveryWorker.sendSmsViaAdapter(
          { recipients: { to: [recipient.address] }, content: { body } },
          logger,
          notifyId,
          smsAdapter,
        )

        await requestDetailService.markRecipientSent(
          notifyId,
          batchId,
          recipient.address,
          result.externalId,
        )
        sent++
      } catch (recipientError) {
        const errorMessage =
          recipientError instanceof Error ? recipientError.message : String(recipientError)
        logger.error(
          `[${notifyId}] SMS merge recipient send failed (batch=${batchId}): ${errorMessage}`,
        )
        await requestDetailService.markRecipientFailed(
          notifyId,
          batchId,
          recipient.address,
          errorMessage,
        )
        failed++
      }
    }

    logger.log(`[${notifyId}] SMS merge batch ${batchId} complete: sent=${sent}, failed=${failed}`)

    // Reconcile the parent request once no recipients remain pending across all batches.
    const pendingRemaining = await requestDetailService.countByStatus(notifyId, 'pending')
    if (pendingRemaining === 0) {
      const failedRemaining = await requestDetailService.countByStatus(notifyId, 'failed')
      const sentRemaining = await requestDetailService.countByStatus(notifyId, 'sent')
      let finalStatus: NotificationStatus
      if (failedRemaining === 0) {
        finalStatus = NotificationStatus.COMPLETED
      } else if (sentRemaining === 0) {
        finalStatus = NotificationStatus.FAILED
      } else {
        finalStatus = NotificationStatus.PARTIALLY_COMPLETED
      }
      await notificationService.update(notifyId, tenantId, {
        status: finalStatus,
        updatedBy: 'sms-delivery-worker',
      })
      logger.log(
        `[${notifyId}] All SMS merge batches complete; parent marked ${finalStatus.toUpperCase()}`,
      )
    }

    return { success: failed === 0, batchId, sent, failed }
  }

  private static async sendSmsViaAdapter(
    payload: any,
    logger: Logger,
    notifyId: string,
    smsAdapter: ISmsTransport,
  ): Promise<{
    externalId: string
    provider: string
    providerResponse?: string
    results?: SmsRecipientResult[]
  }> {
    logger.debug(`[${notifyId}] Sending SMS via ${smsAdapter.name} adapter`)

    // Tagged with our id so a provider delivery report can be matched back to this notification.
    const result = await smsAdapter.send({ ...(payload as object), tag: notifyId } as any)

    return {
      externalId: result.messageId || result.providerResponse || `${smsAdapter.name}-${Date.now()}`,
      provider: smsAdapter.name,
      providerResponse: result.providerResponse,
      // Passed through so the caller can record who actually received the message.
      results: result.results,
    }
  }
}
