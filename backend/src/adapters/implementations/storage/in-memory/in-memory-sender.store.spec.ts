import { Test, TestingModule } from '@nestjs/testing';
import { InMemorySenderStore } from '../../../../../src/adapters/implementations/storage/in-memory/in-memory-sender.store';
import type { StoredSender } from '../../../../../src/adapters/interfaces';

function createSender(overrides: Partial<StoredSender> = {}): StoredSender {
  return {
    id: 's1',
    type: 'email',
    email_address: 'noreply@gov.bc.ca',
    is_default: false,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    ...overrides,
  };
}

describe('InMemorySenderStore', () => {
  let store: InMemorySenderStore;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InMemorySenderStore],
    }).compile();
    store = module.get(InMemorySenderStore);
  });

  it('getById returns null when sender does not exist', async () => {
    const result = await store.getById('missing');
    expect(result).toBeNull();
  });

  it('getById returns sender after set', async () => {
    const sender = createSender({ id: 's1' });
    store.set('s1', sender);

    const result = await store.getById('s1');
    expect(result).toEqual(sender);
  });

  it('getAll returns empty array when no senders', () => {
    expect(store.getAll()).toEqual([]);
  });

  it('getAll returns all stored senders', () => {
    const s1 = createSender({ id: 's1', type: 'email' });
    const s2 = createSender({ id: 's2', type: 'sms', sms_sender: 'GOVBC' });
    store.set('s1', s1);
    store.set('s2', s2);

    expect(store.getAll()).toEqual([s1, s2]);
  });

  it('has returns false for missing id', () => {
    expect(store.has('x')).toBe(false);
  });

  it('has returns true after set', () => {
    const s = createSender({ id: 'x' });
    store.set('x', s);
    expect(store.has('x')).toBe(true);
  });

  it('delete returns false when id does not exist', () => {
    expect(store.delete('missing')).toBe(false);
  });

  it('delete removes sender and returns true', async () => {
    const s = createSender({ id: 'd1' });
    store.set('d1', s);

    const deleted = store.delete('d1');
    expect(deleted).toBe(true);
    expect(await store.getById('d1')).toBeNull();
  });
});
