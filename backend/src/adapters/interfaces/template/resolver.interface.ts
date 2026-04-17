export interface TemplateDefinition {
  id: string;
  type: 'email' | 'sms';
  name: string;
  description?: string;
  subject?: string;
  body: string;
  personalisation?: Record<string, string>;
  active: boolean;
  /** Template engine (e.g. handlebars, jinja2). Defaults to module default when absent. */
  engine?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ITemplateResolver {
  readonly name: string;
  getById(templateId: string): Promise<TemplateDefinition | null>;
}
