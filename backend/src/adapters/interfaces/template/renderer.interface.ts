import { TemplateDefinition } from './resolver.interface';

export interface FileAttachmentValue {
  file: string;
  filename: string;
  sending_method: 'attach' | 'link';
}

export interface RenderContext {
  template: TemplateDefinition;
  personalisation: Record<string, string | FileAttachmentValue>;
  /** Default subject when template has no subject. From config defaults.templates.defaultSubject. */
  defaultSubject?: string;
}

export interface RenderedEmail {
  subject: string;
  body: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    sendingMethod: 'attach' | 'link';
  }>;
}

export interface RenderedSms {
  body: string;
}

/** Options for render methods. outputType defaults by method: html for renderEmail, text for renderSms. */
export interface RenderOptions {
  outputType?: 'html' | 'text';
}

export interface ITemplateRenderer {
  readonly name: string;
  renderEmail(
    context: RenderContext,
    options?: RenderOptions,
  ): Promise<RenderedEmail>;
  renderSms(
    context: RenderContext & { personalisation: Record<string, string> },
    options?: RenderOptions,
  ): Promise<RenderedSms>;
}
