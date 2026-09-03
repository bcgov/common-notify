import { Injectable } from '@nestjs/common'
import MarkdownIt from 'markdown-it'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplateEngine } from '../../enum/template-engine.enum'
import { EmailLogoService } from '../email-logo/email-logo.service'
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service'
import { Template } from './entities/template.entity'

export interface RenderedEmailContent {
  subject?: string
  body: string
  bodyType: 'text' | 'markdown' | 'html'
}

const LAYOUT_SUPPORTED_ENGINES = new Set<TemplateEngine>([
  TemplateEngine.HANDLEBARS,
  TemplateEngine.MUSTACHE,
  TemplateEngine.LEGACY_GC_NOTIFY,
])

@Injectable()
export class EmailTemplateLayoutService {
  private readonly markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
  })

  constructor(
    private readonly tenantSettingsService: TenantSettingsService,
    private readonly emailLogoService: EmailLogoService,
  ) {}

  async apply(template: Template, rendered: RenderedEmailContent): Promise<RenderedEmailContent> {
    if (template.channelCode !== NotificationChannel.EMAIL) {
      return rendered
    }

    if (template.engineCode === TemplateEngine.MJML) {
      // Deliberately do not wrap MJML output: it is a complete, self-contained HTML document,
      // and prepending layout markup could invalidate or break that document.
      return rendered
    }

    if (!LAYOUT_SUPPORTED_ENGINES.has(template.engineCode as TemplateEngine)) {
      return rendered
    }

    const tenantSettings = await this.tenantSettingsService.findByTenantId(template.tenantId)
    if (!tenantSettings?.emailLogoId) {
      return rendered
    }

    const imageUrl = this.emailLogoService.buildPublicImageUrl(tenantSettings.emailLogoId)
    const htmlBody = this.toHtml(rendered.body, rendered.bodyType)

    return {
      ...rendered,
      body: `${this.logoHeader(imageUrl)}\n${htmlBody}`,
      bodyType: 'html',
    }
  }

  private logoHeader(imageUrl: string): string {
    const escapedUrl = this.escapeHtmlAttribute(imageUrl)

    // Table-based layout and inline styles are used for broad email-client compatibility.
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="left" style="padding:0 0 24px 0;"><img src="${escapedUrl}" alt="" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;"></td></tr></table>`
  }

  private toHtml(body: string, bodyType: RenderedEmailContent['bodyType']): string {
    if (bodyType === 'html') {
      return body
    }

    if (bodyType === 'markdown') {
      // This pre-conversion is reached only when a logo is actually being injected.
      // Logo-free messages retain their original body/bodyType and CHES converts them as before.
      return this.markdown.render(body)
    }

    return this.escapeHtml(body).replace(/\r?\n/g, '<br>\n')
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  private escapeHtmlAttribute(value: string): string {
    return this.escapeHtml(value)
  }
}
