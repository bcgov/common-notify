import { Injectable, Inject } from '@nestjs/common'
import { ITemplateRendererRegistry } from '../../adapters/interfaces'
import type { RenderedEmail, RenderedSms, TemplateDefinition } from '../../adapters/interfaces'
import type { NotifyContent } from '../../api/notify/schemas/notify-content'
import { TEMPLATE_RENDERER_REGISTRY_TOKEN } from './tokens'

/**
 * Service to render inline templates (content provided directly in the request)
 * Uses the same renderer infrastructure as template-based renders
 */
@Injectable()
export class InlineRenderingService {
  constructor(
    @Inject(TEMPLATE_RENDERER_REGISTRY_TOKEN)
    private rendererRegistry: ITemplateRendererRegistry,
  ) {}

  /**
   * Render email content inline with the specified renderer
   * @param content Content object with body, subject, and renderer
   * @param params Template variables for rendering
   * @returns Rendered email with subject and body
   */
  async renderEmail(
    content: NotifyContent,
    params: Record<string, unknown> = {},
  ): Promise<RenderedEmail> {
    if (!content.renderer) {
      throw new Error('Renderer must be specified in content for inline rendering')
    }

    const renderer = this.rendererRegistry.getRenderer(content.renderer)

    // Create inline template definition from content
    const inlineTemplate: TemplateDefinition = {
      id: '__inline__',
      name: '__inline_email__',
      type: 'email',
      subject: content.subject || 'Notification',
      body: content.body || '',
      active: true,
    }

    // Convert params to strings (template renderers expect string values)
    const stringParams = this.normalizeParams(params)

    return renderer.renderEmail({
      template: inlineTemplate,
      personalisation: stringParams,
      defaultSubject: 'Notification',
    })
  }

  /**
   * Render SMS content inline with the specified renderer
   * @param content Content object with body and renderer
   * @param params Template variables for rendering
   * @returns Rendered SMS with body
   */
  async renderSms(
    content: NotifyContent,
    params: Record<string, unknown> = {},
  ): Promise<RenderedSms> {
    if (!content.renderer) {
      throw new Error('Renderer must be specified in content for inline rendering')
    }

    const renderer = this.rendererRegistry.getRenderer(content.renderer)

    // Create inline template definition from content
    const inlineTemplate: TemplateDefinition = {
      id: '__inline__',
      name: '__inline_sms__',
      type: 'sms',
      body: content.body || '',
      active: true,
    }

    // Convert params to strings (template renderers expect string values)
    const stringParams = this.normalizeParams(params)

    return renderer.renderSms({
      template: inlineTemplate,
      personalisation: stringParams,
    })
  }

  /**
   * Render message app content inline with the specified renderer
   * @param content Content object with body and renderer
   * @param params Template variables for rendering
   * @returns Rendered message with body
   */
  async renderMsgApp(
    content: NotifyContent,
    params: Record<string, unknown> = {},
  ): Promise<{ body: string }> {
    // Message apps typically use the same rendering as SMS
    return this.renderSms(content, params)
  }

  /**
   * Normalize params by converting all values to strings
   * Template engines work with string values for interpolation
   */
  private normalizeParams(params: Record<string, unknown>): Record<string, string> {
    const normalized: Record<string, string> = {}
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined) {
        normalized[key] = ''
      } else if (typeof value === 'string') {
        normalized[key] = value
      } else if (typeof value === 'object') {
        normalized[key] = JSON.stringify(value)
      } else {
        normalized[key] = String(value)
      }
    }
    return normalized
  }
}
