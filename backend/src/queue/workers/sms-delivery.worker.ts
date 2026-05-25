import { Logger, NotFoundException } from '@nestjs/common'
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
  ): Promise<void> {
    const logger = new Logger(SmsDeliveryWorker.name)

    logger.log(`Registering SMS delivery worker processor (concurrency=${concurrency})`)

    // Register the job processor with configurable concurrency
    // Note: Don't await process() - it sets up listeners and never resolves
    smsQueue.process(concurrency, async (job: Bull.Job<DeliveryJobPayload>) => {
      const { notifyId, tenantId, payload, request } = job.data

      logger.debug(`[${notifyId}] Processing SMS delivery job for tenant=${tenantId}`)

      try {
        // Validate DeliveryJobPayload structure
        if (!notifyId || typeof notifyId !== 'string') {
          throw new Error('Invalid delivery job: notifyId is missing or invalid')
        }
        if (!tenantId || typeof tenantId !== 'string') {
          throw new Error('Invalid delivery job: tenantId is missing or invalid')
        }

        // Validate job data
        if (!payload || typeof payload !== 'object') {
          throw new Error('Invalid delivery job: SMS payload is missing or invalid')
        }

        // Resolve template if templateId is provided in the original request
        // Track per-recipient delivery status
        if ((job.attemptsMade ?? 0) === 0) {
          await requestDetailService.createPending(
            notifyId,
            (payload as any).recipients?.to ?? [],
            'SMS',
            tenantId,
          )
        } else {
          await requestDetailService.resetForRetry(notifyId)
        }

        let resolvedPayload = payload
        if (request?.templateId) {
          logger.debug(`[${notifyId}] Resolving template: ${request.templateId}`)
          try {
            const template = await templatesRepository.findById(tenantId, request.templateId)
            if (!template) {
              throw new NotFoundException(
                `Template '${request.templateId}' not found for tenant '${tenantId}'`,
              )
            }

            // Merge template content into SMS payload if channel matches
            if (template.channelCode === 'SMS') {
              // Render the template with personalisation data from request.params
              // Use request's bodyType if provided, otherwise template's default
              const rendered = await templatesService.renderTemplateContent(
                template,
                request.params || {},
                payload.content?.bodyType,
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

        return { success: true, externalId: result.externalId, provider: result.provider }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const attempt = (job.attemptsMade || 0) + 1
        logger.error(
          `[${notifyId}] Failed to send SMS delivery job (attempt ${attempt}/3): ${errorMessage}`,
          error instanceof Error ? error.stack : '',
        )

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
        }

        // Re-throw to trigger BullMQ retry logic
        throw error
      }
    })

    // Event listeners for job lifecycle
    smsQueue.on('completed', (job: Bull.Job<DeliveryJobPayload>) => {
      const { notifyId } = job.data
      logger.debug(`[${notifyId}] SMS delivery job completed`)
    })

    smsQueue.on('failed', (job: Bull.Job<DeliveryJobPayload>, err: Error) => {
      const { notifyId } = job.data
      logger.error(
        `[${notifyId}] SMS delivery job failed (attempt ${job.attemptsMade}/${job.opts.attempts}): error=${err.message}`,
      )
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
