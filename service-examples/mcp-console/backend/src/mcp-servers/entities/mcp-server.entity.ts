import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type McpTransport = 'streamable-http' | 'sse';

/** Fixed set chosen by the global admin when a server is added. */
export type ServiceCategory = 'msgApp' | 'subscription' | 'template' | 'attachment';

@Entity('mcp_server_registration')
export class McpServerRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  shortName: string;

  @Column({ type: 'varchar', length: 2048 })
  url: string;

  @Column({ type: 'varchar', length: 20, default: 'streamable-http' })
  transport: McpTransport;

  @Column({ type: 'varchar', length: 20, default: 'msgApp' })
  category: ServiceCategory;

  /** AES-256-GCM ciphertext, see common/crypto.util.ts. Never returned from any GET endpoint. */
  @Column({ type: 'text' })
  apiKey: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  enabledTools: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
