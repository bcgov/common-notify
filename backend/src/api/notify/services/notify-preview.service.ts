import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { TemplatesRepository } from '../../templates/templates.repository'
import { TemplatesService } from '../../templates/templates.service'
import { InlineRenderingService } from '../../../services/rendering/inline-rendering.service'
import { NotifySimpleRequest } from '../schemas/notify-simple-request'
import { NotifyContent } from '../schemas/notify-content'

type ChannelName = 'email' | 'sms' | 'msgApp'
const CHANNELS: ChannelName[] = ['email', 'sms', 'msgApp']
const CHANNEL_CODES = { email: 'EMAIL', sms: 'SMS', msgApp: 'MSGAPP' } as const

export type NotifyPreviewResponse = Partial<
  Record<ChannelName, { recipients: unknown; content: Partial<NotifyContent> }>
>

/** Rendering only: deliberately has no notification, queue, safelist or usage dependencies. */
@Injectable()
export class NotifyPreviewService {
  constructor(
    private readonly templatesRepository: TemplatesRepository,
    private readonly templatesService: TemplatesService,
    private readonly inlineRenderingService: InlineRenderingService,
  ) {}

  async render(
    tenantId: string,
    request: NotifySimpleRequest,
    original: NotifySimpleRequest,
  ): Promise<NotifyPreviewResponse> {
    // Check every channel before doing any rendering or template reads.
    for (const name of CHANNELS) {
      const channel = request[name]
      if (!channel) continue
      if (channel.attachments?.length) {
        throw new BadRequestException([`${name}.attachments are not supported in preview`])
      }
      if (!channel.recipients) {
        throw new BadRequestException([`${name}.recipients must be provided`])
      }
      // Transformed DTOs can own optional fields with undefined values. Inspect the
      // submitted object to distinguish an absent mergeArray from a supplied one.
      if (Object.prototype.hasOwnProperty.call(original[name]?.recipients ?? {}, 'mergeArray')) {
        throw new BadRequestException([
          `${name}.recipients.mergeArray mail-merge preview is not yet supported`,
        ])
      }
      // Content is optional in some send DTOs; a preview still needs something to render.
      if (!channel.content?.templateId && !channel.content?.body?.trim()) {
        throw new BadRequestException([
          `${name}.content must provide a templateId or a non-empty body`,
        ])
      }
    }

    const result: NotifyPreviewResponse = {}
    for (const name of CHANNELS) {
      const channel = request[name]
      if (!channel) continue
      const content = channel.content!
      const params = { ...request.params, ...channel.params }
      let rendered: Partial<NotifyContent>
      if (content.templateId) {
        const template = await this.templatesRepository.findById(tenantId, content.templateId)
        if (!template) throw new NotFoundException(`Template ${content.templateId} not found`)
        if (template.channelCode !== CHANNEL_CODES[name]) {
          throw new BadRequestException([
            `${name}.content.templateId must reference a ${CHANNEL_CODES[name]} template`,
          ])
        }
        const templateContent = await this.templatesService.renderTemplateContent(template, params)
        rendered =
          name === 'email'
            ? await this.templatesService.applyEmailLayout(template, templateContent)
            : templateContent
      } else if (content.renderer) {
        if (name === 'email')
          rendered = await this.inlineRenderingService.renderEmail(content, params)
        else if (name === 'sms')
          rendered = await this.inlineRenderingService.renderSms(content, params)
        else rendered = await this.inlineRenderingService.renderMsgApp(content, params)
      } else {
        rendered = content
      }
      result[name] = {
        recipients: original[name]!.recipients,
        content:
          name === 'sms'
            ? { body: rendered.body }
            : {
                subject: rendered.subject ?? ('subject' in content ? content.subject : undefined),
                body: rendered.body,
                bodyType:
                  rendered.bodyType ?? ('bodyType' in content ? content.bodyType : undefined),
                encoding: 'encoding' in content ? content.encoding : undefined,
              },
      }
    }
    return result
  }
}
