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

    // Supply an HTML width as well as inline CSS for email clients with limited CSS support.
    // Keep the intrinsic aspect ratio because approved logos have different proportions.
    const logo = `<img src="${this.escapeHtmlAttribute(imageUrl)}" width="180" alt="Government of British Columbia" style="display:block;width:180px;max-width:100%;height:auto;border:0;margin:0 0 24px 0;font-family:Arial,sans-serif;font-size:16px;color:#003366;">`
    const selectedLogo = tenantSettings?.useCustomEmailHeader
      ? await this.emailLogoService.findByIdIfApproved(logoId)
      : null
    const title = tenantSettings?.useCustomEmailHeader
      ? selectedLogo?.displayTitle?.trim() || 'Government of British Columbia'
      : null
    // Presentation tables and inline styles work in email clients without flex/grid support.
    // The title is real text, so it remains readable when remote images are blocked.
    const header = title
      ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;"><tr><td width="180" valign="middle">${logo.replace('margin:0 0 24px 0;', 'margin:0;')}</td><td valign="middle" style="padding-left:16px;font-family:Arial,sans-serif;font-size:18px;line-height:24px;font-weight:bold;color:#003366;">${this.escapeHtml(title)}</td></tr></table>`
      : logo
    // Complete HTML documents (including MJML) keep their document structure.
    const body = /<body\b[^>]*>/i.test(htmlBody)
      ? htmlBody.replace(/<body\b[^>]*>/i, (openingTag) => `${openingTag}\n${header}`)
      : `${header}\n${htmlBody}`
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
