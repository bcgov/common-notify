import { Injectable } from '@nestjs/common';
import nunjucks from 'nunjucks';
import {
  ITemplateRenderer,
  RenderContext,
  RenderedEmail,
  RenderedSms,
  RenderOptions,
} from '../../../../interfaces';
import { splitPersonalisation } from '../utils/split-personalisation';

/**
 * Nunjucks template renderer. Jinja2-inspired syntax: {{ variable }}, {% for %}, etc.
 * Use engine "nunjucks" or "jinja2" (alias) when creating templates.
 */
@Injectable()
export class NunjucksTemplateRenderer implements ITemplateRenderer {
  readonly name = 'nunjucks';

  renderEmail(
    context: RenderContext,
    _options?: RenderOptions,
  ): Promise<RenderedEmail> {
    const { strings, attachments } = splitPersonalisation(
      context.personalisation,
    );
    const subject = context.template.subject
      ? nunjucks.renderString(context.template.subject, strings)
      : (context.defaultSubject ?? 'Notification');
    const body = nunjucks.renderString(context.template.body, strings);

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
    const body = nunjucks.renderString(
      context.template.body,
      context.personalisation,
    );
    return Promise.resolve({ body });
  }
}
