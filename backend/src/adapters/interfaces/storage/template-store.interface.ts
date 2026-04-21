import { TemplateDefinition } from '../template/resolver.interface';

export interface StoredTemplate extends TemplateDefinition {
  version: number;
  created_at: string;
  updated_at: string;
  description?: string;
}

export interface ITemplateStore {
  getById(id: string): Promise<StoredTemplate | null>;
  set(id: string, template: StoredTemplate): void;
  delete(id: string): boolean;
  getAll(): StoredTemplate[];
  has(id: string): boolean;
}
