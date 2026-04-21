import type { ITemplateRenderer } from './renderer.interface';

export interface ITemplateRendererRegistry {
  getRenderer(engine: string): ITemplateRenderer;
  hasEngine(engine: string): boolean;
  getDefaultEngine(): string;
}
