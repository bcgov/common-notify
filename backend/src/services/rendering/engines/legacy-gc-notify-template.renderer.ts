import { Injectable, Logger } from '@nestjs/common'
import type {
  ITemplateRenderer,
  RenderContext,
  RenderedEmail,
  RenderedSms,
  RenderOptions,
} from '../../../adapters/interfaces'

/**
 * Legacy GC Notify Template Renderer
 *
 * Renders templates using GC Notify's legacy placeholder syntax:
 * - ((key))
 * - ((key??default text))
 * This format uses double parentheses to denote template variables.
 *
 * Example:
 *   Input:  "Hello ((firstName)) ((lastName))!"
 *   Params: { firstName: "John", lastName: "Doe" }
 *   Output: "Hello John Doe!"
 */
@Injectable()
export class LegacyGcNotifyTemplateRenderer implements ITemplateRenderer {
  readonly name = 'legacy_gc_notify'
  private readonly logger = new Logger(LegacyGcNotifyTemplateRenderer.name)

  /**
   * Render a legacy GC Notify template for email
   *
   * @param context Render context with template and personalisation data
   * @returns Rendered email with subject and body
   */
  async renderEmail(context: RenderContext, _options?: RenderOptions): Promise<RenderedEmail> {
    const subject = context.template.subject
      ? this.renderText(context.template.subject, context.personalisation)
      : (context.defaultSubject ?? 'Notification')

    const body = context.template.body
      ? this.renderText(context.template.body, context.personalisation)
      : ''

    return {
      subject,
      body,
    }
  }

  /**
   * Render a legacy GC Notify template for SMS
   *
   * @param context Render context with template and personalisation data
   * @returns Rendered SMS with body
   */
  async renderSms(
    context: RenderContext & { personalisation: Record<string, string> },
    _options?: RenderOptions,
  ): Promise<RenderedSms> {
    const body = context.template.body
      ? this.renderText(context.template.body, context.personalisation)
      : ''

    return {
      body,
    }
  }

  /**
   * Render text with legacy GC Notify syntax:
   * - ((key))
   * - ((key??default text))
   *
   * Replaces placeholders with corresponding values from personalisation.
   * If key is missing and a default is provided, default text is used.
   *
   * @param text Template text
   * @param personalisation Data for substitution
   * @returns Rendered text
   */
  private renderText(text: string, personalisation?: Record<string, string | any>): string {
    if (!text) {
      return ''
    }

    const values = personalisation ?? {}

    let result = text

    // Replace all legacy GC Notify placeholder patterns:
    // - ((key))
    // - ((key??default text))
    const placeholderRegex = /\(\(([a-zA-Z_][a-zA-Z0-9_]*)(?:\?\?([\s\S]*?))?\)\)/g

    result = result.replace(placeholderRegex, (match, key, defaultValue) => {
      const value = values[key]

      if (value !== undefined && value !== null) {
        // Convert value to string (handles numbers, booleans, etc.)
        return String(value)
      }

      // If key not found and default text is provided, use the default.
      if (defaultValue !== undefined) {
        return defaultValue
      }

      // If key not found and no default text exists, leave placeholder as-is.
      if (value === undefined || value === null) {
        this.logger.warn(
          `Placeholder key not found in personalisation data: ${key}. Leaving placeholder as-is.`,
        )
        return match
      }

      return match
    })

    return result
  }
}
