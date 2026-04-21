import { Test, TestingModule } from '@nestjs/testing';
import { InMemoryTemplateStore } from '../../../../../src/adapters/implementations/storage/in-memory/in-memory-template.store';
import type { StoredTemplate } from '../../../../../src/adapters/interfaces';

describe('InMemoryTemplateStore', () => {
  let store: InMemoryTemplateStore;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InMemoryTemplateStore],
    }).compile();
    store = module.get(InMemoryTemplateStore);
  });

  it('getById returns null when template does not exist', async () => {
    const result = await store.getById('missing');
    expect(result).toBeNull();
  });

  it('getById returns template after set', async () => {
    const template: StoredTemplate = {
      id: 't1',
      name: 'Test',
      type: 'email',
      body: 'Hello',
      active: true,
      version: 1,
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
    };
    store.set('t1', template);

    const result = await store.getById('t1');
    expect(result).toEqual(template);
  });

  it('getAll returns empty array when no templates', () => {
    expect(store.getAll()).toEqual([]);
  });

  it('getAll returns all stored templates', () => {
    const t1: StoredTemplate = {
      id: 't1',
      name: 'A',
      type: 'email',
      body: 'B1',
      active: true,
      version: 1,
      created_at: 'x',
      updated_at: 'x',
    };
    const t2: StoredTemplate = {
      id: 't2',
      name: 'B',
      type: 'sms',
      body: 'B2',
      active: true,
      version: 1,
      created_at: 'x',
      updated_at: 'x',
    };
    store.set('t1', t1);
    store.set('t2', t2);

    expect(store.getAll()).toEqual([t1, t2]);
  });

  it('has returns false for missing id', () => {
    expect(store.has('x')).toBe(false);
  });

  it('has returns true after set', () => {
    const t: StoredTemplate = {
      id: 'x',
      name: 'N',
      type: 'email',
      body: 'B',
      active: true,
      version: 1,
      created_at: 'x',
      updated_at: 'x',
    };
    store.set('x', t);
    expect(store.has('x')).toBe(true);
  });

  it('delete returns false when id does not exist', () => {
    expect(store.delete('missing')).toBe(false);
  });

  it('delete removes template and returns true', async () => {
    const t: StoredTemplate = {
      id: 'd1',
      name: 'N',
      type: 'email',
      body: 'B',
      active: true,
      version: 1,
      created_at: 'x',
      updated_at: 'x',
    };
    store.set('d1', t);

    const deleted = store.delete('d1');
    expect(deleted).toBe(true);
    expect(await store.getById('d1')).toBeNull();
  });
});
