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
 * - ((key))            plain interpolation
 * - ((key??content))   conditional: content shows only when key is truthy
 * This format uses double parentheses to denote template variables.
 *
 * Example:
 *   Input:  "Hello ((firstName))! ((vip??Thanks for being a VIP.))"
 *   Params: { firstName: "John", vip: true }
 *   Output: "Hello John! Thanks for being a VIP."
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
   * - ((key))            plain interpolation
   * - ((key??content))   conditional: content shows only when key is truthy
   *
   * Plain placeholders are replaced with their personalisation value.
   * Conditional placeholders render their content only when the key is truthy.
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
    // - ((key))            plain interpolation
    // - ((key??content))   conditional: content shows only when key is truthy
    const placeholderRegex = /\(\(([a-zA-Z_][a-zA-Z0-9_]*)(?:\?\?([\s\S]*?))?\)\)/g

    result = result.replace(placeholderRegex, (match, key, conditionalText) => {
      const value = values[key]

      // Conditional form: ((key??content)). `key` is a boolean condition, not a
      // value to print. Show `content` when truthy; otherwise remove it.
      if (conditionalText !== undefined) {
        return this.isTruthy(value) ? conditionalText : ''
      }

      // Plain interpolation: ((key)).
      if (value !== undefined && value !== null) {
        // Convert value to string (handles numbers, booleans, etc.)
        return String(value)
      }

      // Key not found and no content to fall back on: leave placeholder as-is.
      this.logger.warn(
        `Placeholder key not found in personalisation data: ${key}. Leaving placeholder as-is.`,
      )
      return match
    })

    return result
  }

  /**
   * Evaluate a placeholder value as a boolean condition. Personalisation values
   * arrive as strings, so "", "false", "0", and "no" are treated as falsy.
   */
  private isTruthy(value: unknown): boolean {
    if (value === undefined || value === null) return false
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase()
      return v !== '' && v !== 'false' && v !== '0' && v !== 'no'
    }
    return Boolean(value)
  }
}
