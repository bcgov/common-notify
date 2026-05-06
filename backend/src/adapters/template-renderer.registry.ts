import { Type } from '@nestjs/common'
import type { ITemplateRenderer } from './interfaces'
import { EjsTemplateRenderer } from '../services/rendering/engines/ejs-template.renderer'
import { HandlebarsTemplateRenderer } from '../services/rendering/engines/handlebars-template.renderer'
import { MustacheTemplateRenderer } from '../services/rendering/engines/mustache-template.renderer'

/** Map of engine name to renderer class. Use with GcNotifyModule.templateRenderers. */
export const TEMPLATE_RENDERER_REGISTRY_MAP: Record<string, Type<ITemplateRenderer>> = {
  ejs: EjsTemplateRenderer,
  handlebars: HandlebarsTemplateRenderer,
  mustache: MustacheTemplateRenderer,
}
