import { Injectable } from '@nestjs/common';
import { InMemoryTemplateStore } from '../../../storage/in-memory/in-memory-template.store';
import type {
  ITemplateResolver,
  TemplateDefinition,
} from '../../../../interfaces';

@Injectable()
export class InMemoryTemplateResolver implements ITemplateResolver {
  readonly name = 'in-memory';

  constructor(private readonly store: InMemoryTemplateStore) {}

  async getById(templateId: string): Promise<TemplateDefinition | null> {
    return this.store.getById(templateId);
  }
}
