import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Records that a tenant has "added" (opted into) a globally-registered MCP server. */
@Entity('tenant_service_subscription')
@Index(['tenantName', 'serverId'], { unique: true })
export class TenantServiceSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  tenantName: string;

  @Column({ type: 'uuid' })
  serverId: string;

  /** At most one tool can be the tenant's default for a given service. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  defaultToolName: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
