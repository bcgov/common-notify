import { Test, TestingModule } from '@nestjs/testing';
import { InMemoryTemplateResolver } from '../../../../../../src/adapters/implementations/template/resolver/in-memory/in-memory-template.resolver';
import { InMemoryTemplateStore } from '../../../../../../src/adapters/implementations/storage/in-memory/in-memory-template.store';
import type { StoredTemplate } from '../../../../../../src/adapters/interfaces';

describe('InMemoryTemplateResolver', () => {
  let resolver: InMemoryTemplateResolver;
  let store: InMemoryTemplateStore;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InMemoryTemplateStore, InMemoryTemplateResolver],
    }).compile();
    resolver = module.get(InMemoryTemplateResolver);
    store = module.get(InMemoryTemplateStore);
  });

  it('exposes name as in-memory', () => {
    expect(resolver.name).toBe('in-memory');
  });

  it('getById returns null when store has no template', async () => {
    const result = await resolver.getById('missing');
    expect(result).toBeNull();
  });

  it('getById returns template from store', async () => {
    const template: StoredTemplate = {
      id: 't1',
      name: 'Welcome',
      type: 'email',
      body: 'Hello {{name}}',
      active: true,
      version: 1,
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
    };
    store.set('t1', template);

    const result = await resolver.getById('t1');
    expect(result).toEqual(template);
  });
});
