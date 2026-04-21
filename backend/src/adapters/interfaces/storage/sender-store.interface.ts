/**
 * Sender entity as stored (includes id and timestamps).
 */
export interface StoredSender {
  id: string;
  type: 'email' | 'sms' | 'email+sms';
  email_address?: string;
  sms_sender?: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Interface for sender storage. Allows swapping implementations
 * (e.g. in-memory for dev, database for production).
 */
export interface ISenderStore {
  getById(id: string): Promise<StoredSender | null>;
  getAll(): StoredSender[];
  set(id: string, sender: StoredSender): void;
  delete(id: string): boolean;
  has(id: string): boolean;
}
