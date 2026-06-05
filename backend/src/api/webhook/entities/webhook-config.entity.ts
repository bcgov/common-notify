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
import { WebhookType } from '../../../enum/webhook-type.enum'

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
  headers?: any

  @Column({ name: 'channel_type', length: 20, nullable: true })
  channelType?: string

  /** Status to strigger on */
  @Column({ name: 'trigger_on', type: 'jsonb', nullable: true })
  triggerOn?: any

  /** Webhook type: 'teams' sends a Teams MessageCard payload; 'generic' sends raw JSON */
  @Column({ name: 'webhook_type', type: 'varchar', length: 20, default: WebhookType.GENERIC })
  webhookType: WebhookType

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @Column({ name: 'created_by', length: 255, nullable: true })
  createdBy?: string

  @Column({ name: 'updated_by', length: 255, nullable: true })
  updatedBy?: string
}
