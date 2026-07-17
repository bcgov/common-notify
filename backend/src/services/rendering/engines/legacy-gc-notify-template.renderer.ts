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
 * Renders templates using GC Notify's legacy placeholder syntax: ((key))
 * This format uses double parentheses to denote template variables.
 *
 * Example:
 *   Input:  "Hello ((firstName)) ((lastName))!"
 *   Params: { firstName: "John", lastName: "Doe" }
 *   Output: "Hello John Doe!"
 *
 * Conditional content is also supported: ((key??content))
 * The content is kept only when `key` resolves to a truthy value.
 *
 * Example:
 *   Input:  "Hello((under18?? Please get a parent to sign.))"
 *   Params: { under18: true }
 *   Output: "Hello Please get a parent to sign."
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
   * Render text with legacy GC Notify syntax ((key))
   * Replaces all ((key)) with corresponding values from personalisation
   *
   * @param text Template text
   * @param personalisation Data for substitution
   * @returns Rendered text
   */
  private renderText(text: string, personalisation?: Record<string, string | any>): string {
    if (!text) {
      return ''
    }

    if (!personalisation || Object.keys(personalisation).length === 0) {
      // If no personalisation data, return text as-is (placeholders will remain)
      return text
    }

    // Replace all ((key)) patterns with values from personalisation
    // Pattern: (( followed by word characters/underscores followed by ))
    const placeholderRegex = /\(\(([a-zA-Z_][a-zA-Z0-9_]*)\)\)/g

    let result = text.replace(placeholderRegex, (match, key) => {
      const value = personalisation[key]

      // If key not found, leave placeholder as-is
      if (value === undefined || value === null) {
        this.logger.warn(
          `Placeholder key not found in personalisation data: ${key}. Leaving placeholder as-is.`,
        )
        return match
      }

      // Convert value to string (handles numbers, booleans, etc.)
      return String(value)
    })

    // Resolve conditional blocks after placeholders so any inside kept content are
    // already substituted before the block is evaluated.
    result = this.renderConditionals(result, personalisation)

    return result
  }

  /**
   * Resolve GC Notify conditional blocks: ((key??content))
   * The content is kept when `key` is truthy, otherwise the whole block is removed.
   *
   * @param text Template text
   * @param personalisation Data for evaluating conditions
   * @returns Text with conditional blocks resolved
   */
  private renderConditionals(text: string, personalisation: Record<string, string | any>): string {
    // Pattern: (( key ?? content )) — content is non-greedy up to the closing ))
    const conditionalRegex = /\(\(([a-zA-Z_][a-zA-Z0-9_]*)\?\?([\s\S]*?)\)\)/g

    return text.replace(conditionalRegex, (_match, key: string, content: string) =>
      this.isTruthy(personalisation[key]) ? content : '',
    )
  }

  /**
   * Determine whether a personalisation value enables conditional content.
   * Mirrors GC Notify's str2bool: booleans pass through; strings are truthy when
   * they read as an affirmative value.
   */
  private isTruthy(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value
    }

    if (value === undefined || value === null) {
      return false
    }

    return ['yes', 'y', 'true', '1', 't'].includes(String(value).trim().toLowerCase())
  }
}
