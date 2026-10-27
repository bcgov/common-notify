import { Injectable, Logger } from '@nestjs/common'
import { TemplatesRepository } from '../../templates/templates.repository'
import { TemplatesService } from '../../templates/templates.service'
import { InlineRenderingService } from '../../../services/rendering/inline-rendering.service'
import { countSmsSegments } from '../../../common/utils/sms-segments'
import { describeError } from '../../../common/utils/describe-error'
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

    const render = await this.bodyRenderer(tenantId, request)
    return countSmsSegments(await render({}))
  }

  /**
   * Total segments for an SMS merge: each row renders its own body, so this is the sum of every
   * row's segments rather than rows x segments. `rowParams` are each row's own params, which win
   * over the request's. Fails open per row, the same way as `countSegmentsPerRecipient`.
   */
  async countMergeSegments(
    tenantId: string,
    request: NotifySimpleRequest,
    rowParams: Array<Record<string, unknown>>,
  ): Promise<number> {
    if (!request?.sms) return 0

    // The template is looked up once for the whole merge; rendering is CPU-only, so the rows can
    // run together without touching the connection pool.
    const render = await this.bodyRenderer(tenantId, request)
    const bodies = await Promise.all(rowParams.map((params) => render(params)))
    return bodies.reduce((total, body) => total + countSmsSegments(body), 0)
  }

  /**
   * Resolve how the SMS body will be produced, mirroring SmsDeliveryWorker: a stored template
   * rendered with the request's personalisation, an inline renderer, or a literal body. The
   * returned function renders one body; its argument overrides the request's params.
   */
  private async bodyRenderer(
    tenantId: string,
    request: NotifySimpleRequest | ProcessedNotifySimpleRequest,
  ): Promise<(rowParams: Record<string, unknown>) => Promise<string | undefined>> {
    const sms = request.sms!
    const content = sms.content
    // Channel-level params override request-level params, as in the delivery worker.
    const baseParams = { ...request.params, ...sms.params }
    const failOpen = (error: unknown) => {
      this.logger.warn(
        `Failed to resolve SMS body for segment counting (tenant=${tenantId}); ` +
          `counting as a single segment: ${describeError(error)}`,
      )
      return undefined
    }
    const guarded =
      (render: (params: Record<string, unknown>) => Promise<string | undefined>) =>
      (rowParams: Record<string, unknown>) =>
        render({ ...baseParams, ...rowParams }).catch(failOpen)
    // The same body for every row, with nothing to render.
    const fixed = (body: string | undefined) => () => Promise.resolve(body)

    if (content?.templateId) {
      let template
      try {
        template = await this.templatesRepository.findById(tenantId, content.templateId)
      } catch (error) {
        return fixed(failOpen(error))
      }
      if (template?.channelCode !== 'SMS') return fixed(content.body)
      return guarded(
        async (params) =>
          (await this.templatesService.renderTemplateContent(template, params)).body,
      )
    }

    if (content?.renderer) {
      return guarded(
        async (params) => (await this.inlineRenderingService.renderSms(content, params)).body,
      )
    }

    return fixed(content?.body)
  }
}
