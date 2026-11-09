import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

/**
 * One append-only row each time an admin enables or disables sending for a tenant, written in
 * the same transaction as the change. No relation to Tenant: history outlives the tenant.
 */
@Entity('tenant_sending_history', { schema: 'notify' })
export class TenantSendingHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string

  /** Whether the tenant could send after the change. */
  @Column({ type: 'boolean' })
  enabled: boolean

  /** Given when disabling; null when enabling. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null

  @Column({ type: 'varchar', length: 200, name: 'created_by' })
  createdBy: string

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'created_by_name' })
  createdByName: string | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date
}
