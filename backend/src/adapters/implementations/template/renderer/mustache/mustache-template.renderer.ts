import { Injectable } from '@nestjs/common';
import Mustache from 'mustache';
import {
  ITemplateRenderer,
  RenderContext,
  RenderedEmail,
  RenderedSms,
  RenderOptions,
} from '../../../../interfaces';
import { splitPersonalisation } from '../utils/split-personalisation';

/**
 * Mustache template renderer. Logic-less syntax: {{ variable }}, {{# section }}, etc.
 * Use engine "mustache" when creating templates.
 */
@Injectable()
export class MustacheTemplateRenderer implements ITemplateRenderer {
  readonly name = 'mustache';

  renderEmail(
    context: RenderContext,
    _options?: RenderOptions,
  ): Promise<RenderedEmail> {
    const { strings, attachments } = splitPersonalisation(
      context.personalisation,
    );
    const subject = context.template.subject
      ? Mustache.render(context.template.subject, strings)
      : (context.defaultSubject ?? 'Notification');
    const body = Mustache.render(context.template.body, strings);

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
    });
  }

  renderSms(
    context: RenderContext & { personalisation: Record<string, string> },
    _options?: RenderOptions,
  ): Promise<RenderedSms> {
    const body = Mustache.render(
      context.template.body,
      context.personalisation,
    );
    return Promise.resolve({ body });
  }
}
