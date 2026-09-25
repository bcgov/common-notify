import { Injectable, Logger } from '@nestjs/common'
import type {
  ITemplateRenderer,
  RenderContext,
  RenderedEmail,
  RenderedSms,
  RenderOptions,
} from '../../../adapters/interfaces'
import {
  encodeGcNotifyBlock,
  stripGcNotifyBlockMarkers,
  toGcNotifyEmailHtml,
} from '../gc-notify-markdown'

/**
 * GC Notify's own placeholder semantics, for the GC Notify compatibility routes only.
 *
 * Deliberately separate from `LegacyGcNotifyTemplateRenderer`: that engine is a public `renderer`
 * option on the ordinary notify API, and these rules - GC Notify's truthiness list in particular -
 * would change behaviour for callers who never asked for GC Notify compatibility.
 */
type ListStyle = 'bullet' | 'inline'

/** Empty items are dropped; `0` and `false` are kept, because a caller who sends them means them. */
const hasContent = (item: unknown): boolean => item !== null && item !== undefined && item !== ''

/** The leading blank line terminates the preceding paragraph so the list parses as a list. */
const bulletList = (items: string[]): string => '\n\n' + items.map((item) => `* ${item}`).join('\n')

/** "a", "a and b", "a, b and c" - no quotation marks or other decoration around items. */
const inlineList = (items: string[]): string =>
  items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/**
 * The values GC Notify treats as true in a conditional, in English and French.
 *
 * This is an exact list, not a truthiness test: the value is lowercased and compared as-is, so
 * `"True "` with a trailing space is false, and so is `"on"` or `"Y "`. Surprising, and matched
 * on purpose - a template written against GC Notify must behave the same here.
 */
const TRUTHY_VALUES = new Set([
  'yes',
  'y',
  'true',
  't',
  '1',
  'include',
  'show',
  'oui',
  'vrai',
  'inclure',
  'afficher',
])

/**
 * A placeholder inside a markdown link's URL - `[Click here](((link_url)))`.
 *
 * GC Notify gives this its own pattern because an ordinary placeholder is wrapped in preview
 * highlight markup and a URL must not be. We emit no highlight markup, so the substitution is the
 * same; the pattern is kept separate anyway so the URL case stays explicit and runs first.
 */
const LINK_URL_PLACEHOLDER = /\]\(\(\(([a-zA-Z_][a-zA-Z0-9_]*)\)\)\)/g

/**
 * An ordinary placeholder, or a conditional.
 *
 * The negative lookahead is what makes `(((colour)))` render as `(blue)` rather than breaking:
 * without it the match would start at the first parenthesis and capture `(colour` as the name.
 */
const PLACEHOLDER = /\(\((?!\()([a-zA-Z_][a-zA-Z0-9_]*)(?:\?\?([\s\S]*?))?\)\)/g

@Injectable()
export class GcNotifyNativeTemplateRenderer implements ITemplateRenderer {
  readonly name = 'gc_notify_native'
  private readonly logger = new Logger(GcNotifyNativeTemplateRenderer.name)

  async renderEmail(context: RenderContext, _options?: RenderOptions): Promise<RenderedEmail> {
    const subject = context.template.subject
      ? this.renderText(context.template.subject, context.personalisation, 'inline', false)
      : (context.defaultSubject ?? 'Notification')

    const body = context.template.body
      ? this.renderText(context.template.body, context.personalisation, 'bullet', true)
      : ''

    return { subject, body }
  }

  async renderSms(context: RenderContext, _options?: RenderOptions): Promise<RenderedSms> {
    // An SMS is a single line of plain text: lists are written inline and a multi-line conditional
    // body stays text rather than being pre-rendered to HTML.
    const body = context.template.body
      ? this.renderText(context.template.body, context.personalisation, 'inline', false)
      : ''

    return { body }
  }

  /**
   * @param renderBlocks Whether a multi-line conditional body may be pre-rendered to HTML. True
   *   for an email body, false for a subject or an SMS, neither of which carries markup.
   */
  private renderText(
    text: string,
    personalisation: Record<string, unknown> | undefined,
    listStyle: ListStyle,
    renderBlocks: boolean,
  ): string {
    if (!text) {
      return ''
    }

    const values = personalisation ?? {}
    // Before any real block marker is written, so only markers this render produced can be
    // decoded later.
    let result = stripGcNotifyBlockMarkers(text)

    // URL placeholders first: substituted bare, with no list handling and no block rendering.
    result = result.replace(LINK_URL_PLACEHOLDER, (match, key: string) => {
      const value = values[key]
      if (value === undefined || value === null) {
        this.logger.warn(`No personalisation value for link URL placeholder: ${key}`)
        return match
      }
      return `](${stripGcNotifyBlockMarkers(String(value))})`
    })

    result = result.replace(PLACEHOLDER, (match, key: string, conditionalBody?: string) => {
      const value = values[key]

      if (conditionalBody !== undefined) {
        if (!this.isTruthy(value)) {
          return ''
        }
        return this.renderConditionalBody(conditionalBody, renderBlocks)
      }

      if (Array.isArray(value)) {
        const items = value
          .filter(hasContent)
          .map((item) => stripGcNotifyBlockMarkers(String(item)))
        if (items.length > 0) {
          return listStyle === 'bullet' ? bulletList(items) : inlineList(items)
        }
      } else if (value !== undefined && value !== null) {
        return stripGcNotifyBlockMarkers(String(value))
      }

      this.logger.warn(
        `No personalisation value to render for placeholder: ${key}. Leaving placeholder as-is.`,
      )
      return match
    })

    return result
  }

  /**
   * A single-line conditional body is spliced back into the surrounding sentence. A multi-line one
   * is rendered on its own and carried as a block, so a list or link written inside the condition
   * is parsed as block-level markdown rather than being folded into the paragraph around it.
   */
  private renderConditionalBody(body: string, renderBlocks: boolean): string {
    if (!renderBlocks || !body.includes('\n')) {
      return body
    }

    return encodeGcNotifyBlock(`<div>${toGcNotifyEmailHtml(body).trim()}</div>`)
  }

  /**
   * A conditional's value against GC Notify's exact list. Non-strings are stringified first, so a
   * JSON boolean `true` and the string `"true"` agree.
   */
  private isTruthy(value: unknown): boolean {
    if (value === undefined || value === null) {
      return false
    }

    // A list is a condition in so far as it has something to print; `Boolean([])` is true.
    if (Array.isArray(value)) {
      return value.some(hasContent)
    }

    return TRUTHY_VALUES.has(String(value).toLowerCase())
  }
}
