import { HttpException, Logger, NotFoundException } from '@nestjs/common'
import Bull from 'bull'
import { ConfigService } from '@nestjs/config'
import { DeliveryJobPayload } from '../queue.types'
import { NotificationService } from '../../api/notification/notification.service'
import { NotificationRequestDetailService } from '../../api/notification/notification-request-detail.service'
import { TemplatesRepository } from '../../api/templates/templates.repository'
import { TemplatesService } from '../../api/templates/templates.service'
import { InlineRenderingService } from '../../services/rendering/inline-rendering.service'
import { NotificationStatus } from '../../enum/notification-status.enum'
import { ISmsTransport } from '../../adapters'
import { StructuredLoggerService } from '../../common/logger'

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

  private static normalizeTemplateBodyType(
    bodyType: 'text' | 'markdown' | 'html' | undefined,
  ): 'markdown' | undefined {
    if (bodyType === 'markdown' || bodyType === 'text') {
      return 'markdown'
    }

    return undefined
  }

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

        // Validate job data
        if (!payload || typeof payload !== 'object') {
          throw new Error('Invalid delivery job: SMS payload is missing or invalid')
        }

        if ((job.attemptsMade ?? 0) > 0) {
          await requestDetailService.resetForRetry(notifyId)
        }

        let resolvedPayload = payload
        const smsTemplateId = payload.content?.templateId
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
              // Render the template with personalisation data from request.params
              // Normalize legacy body types before entering the markdown-only render path.
              const rendered = await templatesService.renderTemplateContent(
                template,
                request.params || {},
                SmsDeliveryWorker.normalizeTemplateBodyType(payload.content?.bodyType),
              )

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
            const rendered = await inlineRenderingService.renderSms(
              payload.content,
              payload.params || request?.params,
            )

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

        if (
          !resolvedPayload.recipients ||
          !resolvedPayload.recipients.to ||
          !Array.isArray(resolvedPayload.recipients.to) ||
          resolvedPayload.recipients.to.length === 0
        ) {
          throw new Error('Invalid SMS payload: recipient phone number is missing or invalid')
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

        logger.debug(`[${notifyId}] SMS sent successfully: ${JSON.stringify(result)}`)

        // Request has made it to the sms gateway, update request detail records as sent
        await requestDetailService.markSent(notifyId, result.externalId)

        // Update status to COMPLETED
        await notificationService.update(notifyId, tenantId, {
          status: NotificationStatus.COMPLETED,
          updatedBy: 'system',
        })
        logger.log(`[${notifyId}] Notification marked as COMPLETED`)
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
  private static async sendSmsViaAdapter(
    payload: any,
    logger: Logger,
    notifyId: string,
    smsAdapter: ISmsTransport,
  ): Promise<{ externalId: string; provider: string }> {
    logger.debug(`[${notifyId}] Sending SMS via ${smsAdapter.name} adapter`)

    const result = await smsAdapter.send(payload as any)

    return {
      externalId: result.messageId || result.providerResponse || `${smsAdapter.name}-${Date.now()}`,
      provider: smsAdapter.name,
    }
  }
}
