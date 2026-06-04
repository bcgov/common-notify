import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'
import { Tenant } from '../../admin/tenants/entities/tenant.entity'

@Entity('webhook_config')
export class WebhookConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'tenant_id' })
  tenantId: string

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant

  /** Webhook URL */
  @Column({ length: 2048 })
  url: string

  /** Encrypted webhook secret (optional) */
  @Column({ length: 512, nullable: true })
  secret?: string

  @Column({ default: true })
  active: boolean

  @Column({ type: 'jsonb', nullable: true })
  headers?: Record<string, string>

  @Column({ name: 'channel_type', length: 20, nullable: true })
  channelType?: string

  @Column({ name: 'trigger_on', type: 'jsonb', nullable: true })
  triggerOn?: Record<string, unknown>

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @Column({ name: 'created_by', length: 255, nullable: true })
  createdBy?: string

  @Column({ name: 'updated_by', length: 255, nullable: true })
  updatedBy?: string
}
