import { Module } from '@nestjs/common'
import { TemplateRendererRegistry } from './renderer-registry'
import { HandlebarsTemplateRenderer } from './engines/handlebars-template.renderer'
import { MustacheTemplateRenderer } from './engines/mustache-template.renderer'
import { LegacyGcNotifyTemplateRenderer } from './engines/legacy-gc-notify-template.renderer'
import { MjmlTemplateRenderer } from './engines/mjml-template.renderer'
import { InlineRenderingService } from './inline-rendering.service'
import { TEMPLATE_RENDERER_REGISTRY_TOKEN } from './tokens'

/**
 * Rendering Module
 *
 * Provides template rendering infrastructure for the application.
 * Includes:
 * - Multiple template engines (Handlebars, Mustache, Legacy GC Notify)
 * - Template renderer registry for engine selection
 * - Inline rendering service for request-provided content
 *
 * Can be used by:
 * - Templates service (for database templates)
 * - Inline rendering (for request content)
 * - Any other service needing template rendering
 */
@Module({
  providers: [
    HandlebarsTemplateRenderer,
    MustacheTemplateRenderer,
    LegacyGcNotifyTemplateRenderer,
    MjmlTemplateRenderer,
    {
      provide: TEMPLATE_RENDERER_REGISTRY_TOKEN,
      useFactory: (
        handlebars: HandlebarsTemplateRenderer,
        mustache: MustacheTemplateRenderer,
        legacyGcNotify: LegacyGcNotifyTemplateRenderer,
        mjml: MjmlTemplateRenderer,
      ) => {
        return new TemplateRendererRegistry(
          [
            { engine: 'handlebars', instance: handlebars },
            { engine: 'mustache', instance: mustache },
            { engine: 'legacy_gc_notify', instance: legacyGcNotify },
            { engine: 'mjml', instance: mjml },
          ],
          'handlebars', // default engine
        )
      },
      inject: [
        HandlebarsTemplateRenderer,
        MustacheTemplateRenderer,
        LegacyGcNotifyTemplateRenderer,
        MjmlTemplateRenderer,
      ],
    },
    InlineRenderingService,
  ],
  exports: [InlineRenderingService, TEMPLATE_RENDERER_REGISTRY_TOKEN],
})
export class RenderingModule {}
