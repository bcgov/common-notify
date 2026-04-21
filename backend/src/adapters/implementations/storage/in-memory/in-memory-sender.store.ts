import { Injectable } from '@nestjs/common';
import type { ISenderStore, StoredSender } from '../../../interfaces';

@Injectable()
export class InMemorySenderStore implements ISenderStore {
  private readonly senders = new Map<string, StoredSender>();

  getById(id: string): Promise<StoredSender | null> {
    const sender = this.senders.get(id);
    return Promise.resolve(sender ?? null);
  }

  set(id: string, sender: StoredSender): void {
    this.senders.set(id, sender);
  }

  delete(id: string): boolean {
    return this.senders.delete(id);
  }

  getAll(): StoredSender[] {
    return Array.from(this.senders.values());
  }

  has(id: string): boolean {
    return this.senders.has(id);
  }
}
