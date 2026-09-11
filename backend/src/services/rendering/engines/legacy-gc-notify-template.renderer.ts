import { Injectable, Logger } from '@nestjs/common'
import type {
  ITemplateRenderer,
  RenderContext,
  RenderedEmail,
  RenderedSms,
  RenderOptions,
} from '../../../adapters/interfaces'

/**
 * How a list value is written out. GC Notify has no list syntax: a placeholder becomes a list
 * purely because the caller passed an array, and the form depends on where it appears.
 */
type ListStyle = 'bullet' | 'inline'

/** Empty items are dropped, matching GC Notify. `0` and `false` are values and are kept. */
const hasContent = (item: unknown): boolean => item !== null && item !== undefined && item !== ''

/**
 * The leading blank line is required: it terminates the preceding markdown paragraph so the list is
 * parsed as a list rather than as a continuation of the sentence above it.
 */
const bulletList = (items: string[]): string => '\n\n' + items.map((item) => `* ${item}`).join('\n')

/** "a", "a and b", "a, b and c" - no quotation marks or other decoration around items. */
const inlineList = (items: string[]): string =>
  items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

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
 *
 * An array value renders as a list. Channels that render markdown get bullets; single-line fields
 * (the subject, an SMS) get an inline sentence:
 *   Params: { items: ["apples", "pears", "plums"] }
 *   Body:    "\n\n* apples\n* pears\n* plums"   ->  <ul><li>...  once markdown-rendered
 *   Subject: "apples, pears and plums"
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
    // A subject is a single line, so a list is written inline there; the body is markdown, so a
    // list becomes bullets.
    const subject = context.template.subject
      ? this.renderText(context.template.subject, context.personalisation, 'inline')
      : (context.defaultSubject ?? 'Notification')

    const body = context.template.body
      ? this.renderText(context.template.body, context.personalisation, 'bullet')
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
  async renderSms(context: RenderContext, _options?: RenderOptions): Promise<RenderedSms> {
    // An SMS is a single line of plain text, so a list is written inline.
    const body = context.template.body
      ? this.renderText(context.template.body, context.personalisation, 'inline')
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
   * An array value is written out as a list, in the form `listStyle` asks for.
   *
   * @param text Template text
   * @param personalisation Data for substitution
   * @param listStyle How to write out an array value
   * @returns Rendered text
   */
  private renderText(
    text: string,
    personalisation: Record<string, unknown> | undefined,
    listStyle: ListStyle,
  ): string {
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
      // An array is a list. Empty items are dropped; a list left with nothing to print is
      // treated the same as a missing key.
      if (Array.isArray(value)) {
        const items = value.filter(hasContent).map(String)
        if (items.length > 0) {
          return listStyle === 'bullet' ? bulletList(items) : inlineList(items)
        }
      } else if (value !== undefined && value !== null) {
        // Convert value to string (handles numbers, booleans, etc.)
        return String(value)
      }

      // No value to print - the key is missing, or its list held nothing: leave placeholder as-is.
      this.logger.warn(
        `No personalisation value to render for placeholder: ${key}. Leaving placeholder as-is.`,
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
    // A list is a condition only in so far as it has something to print; `Boolean([])` is true.
    if (Array.isArray(value)) return value.some(hasContent)
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase()
      return v !== '' && v !== 'false' && v !== '0' && v !== 'no'
    }
    return Boolean(value)
  }
}
