import { Injectable, BadRequestException } from '@nestjs/common'
import Handlebars from 'handlebars'
import mjml2html from 'mjml'
import {
  ITemplateRenderer,
  RenderContext,
  RenderedEmail,
  RenderedSms,
  RenderOptions,
} from '../../../adapters/interfaces'
import { splitPersonalisation } from '../utils/split-personalisation'

const validateTemplate = (template: string): void => {
  const dangerousPatterns = [
    /registerHelper/i,
    /require\s*\(/i,
    /process\./i,
    /fs\./i,
    /__dirname|__filename/i,
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
export class MjmlTemplateRenderer implements ITemplateRenderer {
  readonly name = 'mjml'

  async renderEmail(context: RenderContext, _options?: RenderOptions): Promise<RenderedEmail> {
    const { strings, attachments } = splitPersonalisation(context.personalisation)

    if (context.template.subject) {
      validateTemplate(context.template.subject)
    }
    validateTemplate(context.template.body)

    const subject = context.template.subject
      ? Handlebars.compile(context.template.subject)(strings)
      : (context.defaultSubject ?? 'Notification')

    // Stored SMS templates still flow through renderEmail in TemplatesService.
    if (context.template.type === 'sms') {
      return {
        subject,
        body: Handlebars.compile(context.template.body)(strings),
        attachments:
          attachments.length > 0
            ? attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                sendingMethod: a.sendingMethod,
              }))
            : undefined,
      }
    }

    const interpolatedBody = Handlebars.compile(context.template.body)(strings)

    try {
      const result = await mjml2html(interpolatedBody, {
        validationLevel: 'strict',
        ignoreIncludes: true,
      })

      return {
        subject,
        body: result.html,
        attachments:
          attachments.length > 0
            ? attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                sendingMethod: a.sendingMethod,
              }))
            : undefined,
      }
    } catch (error) {
      const validationErrors =
        typeof error === 'object' && error !== null && 'errors' in error
          ? (error.errors as Array<{ message?: string }>)
          : []
      const firstValidationMessage = validationErrors[0]?.message
      const message =
        firstValidationMessage ||
        (error instanceof Error && error.message ? error.message.split('\n')[0] : '') ||
        'MJML compilation failed'

      throw new BadRequestException(`MJML compilation error: ${message}`)
    }
  }

  async renderSms(context: RenderContext, _options?: RenderOptions): Promise<RenderedSms> {
    validateTemplate(context.template.body)

    // SMS is plain text: no MJML compilation and no HTML escaping of personalisation.
    return {
      body: Handlebars.compile(context.template.body, { noEscape: true })(context.personalisation),
    }
  }
}
