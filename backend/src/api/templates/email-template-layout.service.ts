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

/**
 * A header to use in place of the tenant's own, for a send that carries its own branding - an
 * event configured with a custom header. Either part may be absent: a logo with no title and a
 * title with no logo are both valid.
 */
export interface EmailHeaderOverride {
  logoId: string | null
  title: string | null
}

/**
 * Height a sender's own logo is rendered at. The width follows it, so a wide logo stays wide.
 * The preview on the test send screen uses the same figure.
 */
const LOGO_HEIGHT_PX = 72

/**
 * Gap between the logo/title row and the rule under it.
 *
 * Zero on purpose. The approved logos are SVGs with whitespace around their artwork, so the
 * image box is taller than the logo looks and already supplies the gap - padding here is added
 * on top of it and reads as too much. A logo trimmed to its artwork would want a value back.
 */
const HEADER_PADDING_BELOW_PX = 0

/** Gap between that rule and the message itself, which separates the two. */
const HEADER_MARGIN_BELOW_PX = 28

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

  /**
   * Put the sender's branding above the rendered body.
   *
   * @param header Branding to use instead of the tenant's. Omit it and the tenant's own logo is
   *   used, which is what every send that is not event-sourced does.
   */
  async apply(
    template: Template,
    rendered: RenderedEmailContent,
    header?: EmailHeaderOverride,
  ): Promise<RenderedEmailContent> {
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

    // A sender with its own branding gets the full header; everyone else keeps the tenant logo
    // exactly as it has always been rendered.
    const headerMarkup = header
      ? this.customHeaderHtml(header.logoId, header.title)
      : this.tenantLogoHtml(await this.tenantLogoId(template.tenantId))

    if (!headerMarkup) {
      return rendered
    }

    const htmlBody = this.toHtml(rendered.body, rendered.bodyType)

    return {
      ...rendered,
      body: `${headerMarkup}\n${htmlBody}`,
      bodyType: 'html',
    }
  }

  private async tenantLogoId(tenantId: string): Promise<string | null> {
    const tenantSettings = await this.tenantSettingsService.findByTenantId(tenantId)
    return tenantSettings?.emailLogoId ?? null
  }

  /** The tenant's logo, unchanged since before senders could carry their own branding. */
  private tenantLogoHtml(logoId: string | null): string | null {
    if (!logoId) return null

    const imageUrl = this.escapeHtmlAttribute(this.emailLogoService.buildPublicImageUrl(logoId))
    return `<img src="${imageUrl}" alt="">`
  }

  /**
   * A sender's own header: a logo, a title beside it, or both.
   *
   * Laid out with a table and inline styles rather than CSS, because that is what mail clients
   * agree on - Outlook in particular ignores flex and much of the box model.
   *
   * The measurements match .events__header-preview-row and its children, so that the preview on
   * the test send screen shows what actually arrives. The one thing not reproduced is the
   * preview's `object-fit: contain` cap on width: mail clients do not support it, and enforcing
   * both a height and a max-width there would distort a wide logo rather than letterbox it. The
   * height is what is held to, and the width follows it.
   */
  private customHeaderHtml(logoId: string | null, title: string | null): string | null {
    if (!logoId && !title) return null

    const divider = '1px solid #d8d8d8'
    // Tight above the rule and generous below it, so the header reads as one block and the
    // message below it as another, rather than the rule floating between two equal gaps.
    const cellStyle = `vertical-align:middle;padding-bottom:${HEADER_PADDING_BELOW_PX}px;border-bottom:${divider};`
    const cells: string[] = []

    if (logoId) {
      const imageUrl = this.escapeHtmlAttribute(this.emailLogoService.buildPublicImageUrl(logoId))
      cells.push(
        // width:1% collapses the cell onto the logo so the title starts beside it rather than
        // across the full width of the row.
        `<td style="${cellStyle}width:1%;white-space:nowrap;padding-right:16px;">` +
          `<img src="${imageUrl}" alt="" height="${LOGO_HEIGHT_PX}" style="height:${LOGO_HEIGHT_PX}px;width:auto;border:0;display:block;">` +
          `</td>`,
      )
    }

    if (title) {
      // The rule between the two halves is drawn on the text rather than on the cell, so that it
      // is only as tall as the title. On the cell it would run the full height of the row, down
      // to the rule underneath it - the preview centres the title instead, and sizes it to its
      // own content.
      const separator = logoId
        ? `<div style="border-left:${divider};padding-left:16px;">${this.escapeHtml(title)}</div>`
        : this.escapeHtml(title)

      cells.push(`<td style="${cellStyle}font-size:20px;color:#2d2d2d;">${separator}</td>`)
    }

    return (
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
      `style="width:100%;border-collapse:collapse;margin-bottom:${HEADER_MARGIN_BELOW_PX}px;">` +
      `<tr>${cells.join('')}</tr></table>`
    )
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
