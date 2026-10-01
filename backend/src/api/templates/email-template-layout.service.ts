import { Injectable } from '@nestjs/common'
import MarkdownIt from 'markdown-it'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { EmailLogoService } from '../email-logo/email-logo.service'
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service'
import { Template } from './entities/template.entity'

export interface RenderedEmailContent {
  subject?: string
  body: string
  bodyType: 'text' | 'markdown' | 'html'
}

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

  async apply(
    template: Pick<Template, 'tenantId' | 'channelCode'>,
    rendered: RenderedEmailContent,
  ): Promise<RenderedEmailContent> {
    if (template.channelCode !== NotificationChannel.EMAIL) {
      return rendered
    }

    const tenantSettings = await this.tenantSettingsService.findByTenantId(template.tenantId)
    const logoId = tenantSettings?.emailLogoId ?? (await this.emailLogoService.getDefault()).id
    const imageUrl = this.emailLogoService.buildPublicImageUrl(logoId)
    const htmlBody = this.toHtml(rendered.body, rendered.bodyType)

    const logo = `<img src="${this.escapeHtmlAttribute(imageUrl)}" alt="">`
    // Complete HTML documents (including MJML) keep their document structure.
    const body = /<body\b[^>]*>/i.test(htmlBody)
      ? htmlBody.replace(/<body\b[^>]*>/i, (openingTag) => `${openingTag}\n${logo}`)
      : `${logo}\n${htmlBody}`
    return {
      ...rendered,
      body,
      bodyType: 'html',
    }
  }

  private toHtml(body: string, bodyType: RenderedEmailContent['bodyType']): string {
    if (bodyType === 'html') {
      return body
    }

    if (bodyType === 'markdown') {
      // This pre-conversion is reached only when a logo is actually being injected.
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
