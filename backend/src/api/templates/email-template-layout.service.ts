import { Injectable } from '@nestjs/common'
import MarkdownIt from 'markdown-it'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplateEngine } from '../../enum/template-engine.enum'
import { EmailLogoService } from '../email-logo/email-logo.service'
import { EmailLogoStorageService } from '../email-logo/email-logo-storage.service'
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service'
import { Template } from './entities/template.entity'

export interface RenderedEmailContent {
  subject?: string
  body: string
  bodyType: 'text' | 'markdown' | 'html'
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType: string
    sendingMethod: 'attach'
    contentId?: string
    disposition?: 'inline'
  }>
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
    private readonly emailLogoStorage: EmailLogoStorageService,
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

    const logo = await this.emailLogoService.findByIdIfApproved(tenantSettings.emailLogoId)
    if (!logo?.fileKey) {
      throw new Error(`Selected email logo '${tenantSettings.emailLogoId}' is unavailable`)
    }

    const metadata = await this.emailLogoStorage.head(logo.fileKey)
    if (!metadata) {
      throw new Error(`Selected email logo object '${logo.fileKey}' is unavailable`)
    }

    const content = await this.emailLogoStorage.download(logo.fileKey)
    const contentId = `email-logo-${logo.id}`
    const htmlBody = this.toHtml(rendered.body, rendered.bodyType)

    return {
      ...rendered,
      body: `<img src="cid:${contentId}" alt="${this.escapeHtmlAttribute(logo.name || 'Organization logo')}">\n${htmlBody}`,
      bodyType: 'html',
      attachments: [
        ...(rendered.attachments ?? []),
        {
          filename: logo.fileKey.split('/').pop() || `${logo.id}.img`,
          content,
          contentType: metadata.contentType || 'application/octet-stream',
          sendingMethod: 'attach',
          contentId,
          disposition: 'inline',
        },
      ],
    }
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
