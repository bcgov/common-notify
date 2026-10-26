import { Injectable, Logger } from '@nestjs/common'
import { TemplatesRepository } from '../../templates/templates.repository'
import { TemplatesService } from '../../templates/templates.service'
import { InlineRenderingService } from '../../../services/rendering/inline-rendering.service'
import { countSmsSegments } from '../../../common/utils/sms-segments'
import type { NotifySimpleRequest } from '../schemas/notify-simple-request'
import type { ProcessedNotifySimpleRequest } from '../schemas/stored-notify-attachment'

/**
 * Works out how many billable SMS segments a request will cost per recipient.
 *
 * ACS bills each segment of a concatenated SMS as its own message, so usage and limits are
 * counted in segments rather than in requests. The body is resolved here exactly the way
 * SmsDeliveryWorker resolves it at send time — same template, same personalisation merge — so
 * the count charged at acceptance matches what actually goes on the wire.
 */
@Injectable()
export class SmsSegmentService {
  private readonly logger = new Logger(SmsSegmentService.name)

  constructor(
    private readonly templatesRepository: TemplatesRepository,
    private readonly templatesService: TemplatesService,
    private readonly inlineRenderingService: InlineRenderingService,
  ) {}

  /**
   * Segments a single recipient of this request will be charged. Returns 0 when the request has
   * no SMS channel.
   *
   * Fail-open: if the body cannot be resolved (missing template, render failure) this returns 1
   * rather than throwing. The request is about to be validated and rejected on its own merits,
   * and usage accounting must never be the thing that fails a send.
   */
  async countSegmentsPerRecipient(
    tenantId: string,
    request: NotifySimpleRequest | ProcessedNotifySimpleRequest,
  ): Promise<number> {
    if (!request?.sms) return 0

    const body = await this.resolveBody(tenantId, request)
    return countSmsSegments(body)
  }

  /**
   * Resolve the SMS body that will be sent, mirroring SmsDeliveryWorker: a stored template
   * rendered with the request's personalisation, an inline renderer, or a literal body.
   */
  private async resolveBody(
    tenantId: string,
    request: NotifySimpleRequest | ProcessedNotifySimpleRequest,
  ): Promise<string | undefined> {
    const sms = request.sms!
    const content = sms.content
    // Channel-level params override request-level params, as in the delivery worker.
    const params = { ...request.params, ...sms.params }

    try {
      if (content?.templateId) {
        const template = await this.templatesRepository.findById(tenantId, content.templateId)
        if (!template || template.channelCode !== 'SMS') return content.body
        const rendered = await this.templatesService.renderTemplateContent(template, params)
        return rendered.body
      }

      if (content?.renderer) {
        const rendered = await this.inlineRenderingService.renderSms(content, params)
        return rendered.body
      }

      return content?.body
    } catch (error) {
      this.logger.warn(
        `Failed to resolve SMS body for segment counting (tenant=${tenantId}); ` +
          `counting as a single segment: ${error instanceof Error ? error.message : String(error)}`,
      )
      return undefined
    }
  }
}
