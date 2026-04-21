import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';
import {
  ITemplateRenderer,
  RenderContext,
  RenderedEmail,
  RenderedSms,
  RenderOptions,
} from '../../../../interfaces';
import { splitPersonalisation } from '../utils/split-personalisation';

@Injectable()
export class HandlebarsTemplateRenderer implements ITemplateRenderer {
  readonly name = 'handlebars';

  renderEmail(
    context: RenderContext,
    _options?: RenderOptions,
  ): Promise<RenderedEmail> {
    const { strings, attachments } = splitPersonalisation(
      context.personalisation,
    );
    const subject = context.template.subject
      ? Handlebars.compile(context.template.subject)(strings)
      : (context.defaultSubject ?? 'Notification');
    const body = Handlebars.compile(context.template.body)(strings);

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
    const body = Handlebars.compile(context.template.body)(
      context.personalisation,
    );
    return Promise.resolve({ body });
  }
}
