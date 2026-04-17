import { Injectable } from '@nestjs/common';
import { NunjucksTemplateRenderer } from '../nunjucks/nunjucks-template.renderer';
import type {
  ITemplateRenderer,
  RenderContext,
  RenderedEmail,
  RenderedSms,
  RenderOptions,
} from '../../../../interfaces';

/**
 * Jinja2-style template renderer. Uses Nunjucks under the hood (Jinja2-inspired).
 * Syntax: {{ variable }}, {% for %}, {% if %}, etc.
 * Use engine "jinja2" when creating templates.
 */
@Injectable()
export class Jinja2TemplateRenderer implements ITemplateRenderer {
  readonly name = 'jinja2';

  constructor(private readonly nunjucks: NunjucksTemplateRenderer) {}

  async renderEmail(
    context: RenderContext,
    options?: RenderOptions,
  ): Promise<RenderedEmail> {
    return this.nunjucks.renderEmail(context, options);
  }

  async renderSms(
    context: RenderContext & { personalisation: Record<string, string> },
    options?: RenderOptions,
  ): Promise<RenderedSms> {
    return this.nunjucks.renderSms(context, options);
  }
}
