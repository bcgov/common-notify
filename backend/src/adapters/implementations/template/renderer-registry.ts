import { Injectable } from '@nestjs/common';
import type {
  ITemplateRenderer,
  ITemplateRendererRegistry,
} from '../../interfaces';

@Injectable()
export class TemplateRendererRegistry implements ITemplateRendererRegistry {
  private readonly renderers = new Map<string, ITemplateRenderer>();
  private readonly defaultEngine: string;

  constructor(
    renderers: Array<{ engine: string; instance: ITemplateRenderer }>,
    defaultEngine: string,
  ) {
    for (const { engine, instance } of renderers) {
      this.renderers.set(engine, instance);
    }
    this.defaultEngine = defaultEngine;
  }

  getRenderer(engine: string): ITemplateRenderer {
    const renderer = this.renderers.get(engine);
    if (!renderer) {
      throw new Error(
        `Unknown template engine: ${engine}. Available: ${Array.from(this.renderers.keys()).join(', ')}`,
      );
    }
    return renderer;
  }

  hasEngine(engine: string): boolean {
    return this.renderers.has(engine);
  }

  getDefaultEngine(): string {
    return this.defaultEngine;
  }
}
