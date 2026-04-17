import { Type } from '@nestjs/common';
import { EjsTemplateRenderer } from './implementations/template/renderer/ejs/ejs-template.renderer';
import { HandlebarsTemplateRenderer } from './implementations/template/renderer/handlebars/handlebars-template.renderer';
import { Jinja2TemplateRenderer } from './implementations/template/renderer/jinja2/jinja2-template.renderer';
import { MustacheTemplateRenderer } from './implementations/template/renderer/mustache/mustache-template.renderer';
import { NunjucksTemplateRenderer } from './implementations/template/renderer/nunjucks/nunjucks-template.renderer';
import type { ITemplateRenderer } from './interfaces';

/** Map of engine name to renderer class. Use with GcNotifyModule.templateRenderers. */
export const TEMPLATE_RENDERER_REGISTRY_MAP: Record<
  string,
  Type<ITemplateRenderer>
> = {
  ejs: EjsTemplateRenderer,
  handlebars: HandlebarsTemplateRenderer,
  jinja2: Jinja2TemplateRenderer,
  mustache: MustacheTemplateRenderer,
  nunjucks: NunjucksTemplateRenderer,
};
