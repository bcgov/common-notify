import { Injectable, BadRequestException } from '@nestjs/common'
import Handlebars from 'handlebars'
import {
  ITemplateRenderer,
  RenderContext,
  RenderedEmail,
  RenderedSms,
  RenderOptions,
} from '../../../adapters/interfaces'
import { splitPersonalisation } from '../utils/split-personalisation'

/**
 * Validates template content for dangerous patterns.
 * Handlebars is safe by default (no code execution), but this guards against
 * future accidental registration of unsafe custom helpers.
 */
const validateTemplate = (template: string): void => {
  const dangerousPatterns = [
    /registerHelper/i, // Attempting to register helpers
    /require\s*\(/i, // Node.js require()
    /process\./i, // Node.js process object
    /fs\./i, // Node.js fs module
    /__dirname|__filename/i, // Node.js globals
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(template)) {
      throw new BadRequestException(
        `Template contains potentially unsafe pattern: ${pattern.source}`,
      )
    }
  }
}

@Injectable()
export class HandlebarsTemplateRenderer implements ITemplateRenderer {
  readonly name = 'handlebars'

  renderEmail(context: RenderContext, _options?: RenderOptions): Promise<RenderedEmail> {
    const { strings, attachments } = splitPersonalisation(context.personalisation)

    // Validate templates for dangerous patterns
    if (context.template.subject) {
      validateTemplate(context.template.subject)
    }
    validateTemplate(context.template.body)

    const subject = context.template.subject
      ? Handlebars.compile(context.template.subject)(strings)
      : (context.defaultSubject ?? 'Notification')
    const body = Handlebars.compile(context.template.body)(strings)

    return Promise.resolve({
      subject,
      body,
      attachments:
        attachments.length > 0
          ? attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              sendingMethod: a.sendingMethod,
            }))
          : undefined,
    })
  }

  renderSms(context: RenderContext, _options?: RenderOptions): Promise<RenderedSms> {
    // Validate template for dangerous patterns
    validateTemplate(context.template.body)

    // SMS is plain text, never HTML: noEscape keeps personalisation literal. Without it
    // Handlebars escapes for HTML and a value like "O'Brien" is sent as "O&#x27;Brien".
    const body = Handlebars.compile(context.template.body, { noEscape: true })(
      context.personalisation,
    )
    return Promise.resolve({ body })
  }
}
