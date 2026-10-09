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

/**
 * A header to use in place of the tenant's own, for a send that carries its own branding - an
 * event configured with a custom header. A null title shows the logo alone; a null logo inherits
 * the tenant's logo, or the system default.
 */
export interface EmailHeaderOverride {
  logoId: string | null
  title: string | null
}

/**
 * Height a sender's own logo is rendered at. The width follows it, so a wide logo stays wide.
 * The preview on the test send screen uses the same figure.
 */
const LOGO_HEIGHT_PX = 80

/**
 * Gap between the logo/title row and the rule under it.
 *
 * Zero on purpose. The approved logos have whitespace around their artwork, so the image box is
 * taller than the logo looks and already supplies the gap - padding here is added on top of it
 * and reads as too much. A logo trimmed to its artwork would want a value back.
 */
const HEADER_PADDING_BELOW_PX = 0

/** Gap between that rule and the message itself, which separates the two. */
const HEADER_MARGIN_BELOW_PX = 28

/** Title used when a logo has no display title of its own. */
const DEFAULT_HEADER_TITLE = ''

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
   * @param header Branding to use instead of the tenant's. Omit it and the tenant's own header is
   *   used, which is what every send that is not event-sourced does.
   */
  async apply(
    template: Pick<Template, 'tenantId' | 'channelCode'>,
    rendered: RenderedEmailContent,
    header?: EmailHeaderOverride,
  ): Promise<RenderedEmailContent> {
    if (template.channelCode !== NotificationChannel.EMAIL) {
      return rendered
    }

    const { logoId, title, alt } = await this.resolveHeader(template.tenantId, header)
    const headerMarkup = this.headerHtml(logoId, title, alt)

    const htmlBody = this.toHtml(rendered.body, rendered.bodyType)
    const headerContainer = `<div style="background-color: #ffffff; max-width: 600px;">${headerMarkup}</div>`
    // Complete HTML documents (including MJML) keep their document structure.
    const body = /<body\b[^>]*>/i.test(htmlBody)
      ? htmlBody.replace(/<body\b[^>]*>/i, (openingTag) => `${openingTag}\n${headerContainer}`)
      : `${headerContainer}\n${htmlBody}`
    return {
      ...rendered,
      body,
      bodyType: 'html',
    }
  }

  /**
   * The logo and title a send is branded with.
   *
   * An event with a custom header uses its own logo and title, inheriting the tenant's logo (or
   * the system default) when it names none. Every other send uses the tenant's logo, with the
   * logo's display title beside it when the tenant has turned that on.
   */
  private async resolveHeader(
    tenantId: string,
    header?: EmailHeaderOverride,
  ): Promise<{ logoId: string; title: string | null; alt: string }> {
    const tenantSettings = header?.logoId
      ? null
      : await this.tenantSettingsService.findByTenantId(tenantId)
    const logoId =
      header?.logoId ?? tenantSettings?.emailLogoId ?? (await this.emailLogoService.getDefault()).id
    const logo = await this.emailLogoService.findByIdIfApproved(logoId)
    const logoTitle = logo?.displayTitle?.trim() || DEFAULT_HEADER_TITLE

    const title = header ? header.title : tenantSettings?.useCustomEmailHeader ? logoTitle : null

    // A title beside the logo already says what it shows, so the image is then decorative.
    return { logoId, title, alt: title ? '' : logoTitle }
  }

  /**
   * The header: a logo with an optional title beside it.
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
  private headerHtml(logoId: string, title: string | null, alt: string): string {
    const divider = '1px solid #d8d8d8'
    // Tight above the rule and generous below it, so the header reads as one block and the
    // message below it as another, rather than the rule floating between two equal gaps.
    const cellStyle = `vertical-align:middle;padding-bottom:${HEADER_PADDING_BELOW_PX}px;border-bottom:${divider};`
    const imageUrl = this.escapeHtmlAttribute(this.emailLogoService.buildEmailImageUrl(logoId))
    const cells = [
      // width:1% collapses the cell onto the logo so the title starts beside it rather than
      // across the full width of the row.
      `<td style="${cellStyle}width:1%;white-space:nowrap;padding-right:16px;">` +
        `<img src="${imageUrl}" alt="${this.escapeHtmlAttribute(alt)}" height="${LOGO_HEIGHT_PX}" style="height:${LOGO_HEIGHT_PX}px;width:auto;border:0;display:block;">` +
        `</td>`,
    ]

    if (title) {
      // The rule between the two halves is drawn on the text rather than on the cell, so that it
      // is only as tall as the title. On the cell it would run the full height of the row - the
      // preview centres the title instead, and sizes it to its own content.
      cells.push(
        `<td style="${cellStyle}font-size:20px;color:#2d2d2d;">` +
          `<div style="border-left:${divider};padding-left:16px;">${this.escapeHtml(title)}</div>` +
          `</td>`,
      )
    }

    return (
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
      `style="width:100%;border-collapse:collapse;">` +
      `<tr>${cells.join('')}</tr>` +
      // The gap below the rule is a spacer row rather than a margin on the table: Outlook's Word
      // renderer misplaces table margins, putting the gap above the rule instead of below it.
      `<tr><td colspan="${cells.length}" height="${HEADER_MARGIN_BELOW_PX}" ` +
      `style="height:${HEADER_MARGIN_BELOW_PX}px;line-height:${HEADER_MARGIN_BELOW_PX}px;font-size:0;">&nbsp;</td></tr>` +
      `</table>`
    )
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
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
  }

  private escapeHtmlAttribute(value: string): string {
    return this.escapeHtml(value)
  }
}
