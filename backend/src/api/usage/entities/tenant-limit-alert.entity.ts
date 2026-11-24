import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm'
import { Tenant } from '../../admin/tenants/entities/tenant.entity'

/**
 * TenantLimitAlert Entity
 *
 * Per-(tenant, channel) limit-alert configuration. One row per (tenant, channel_code), seeded
 * when the tenant is created (see migration V81). Holds the warning threshold and an enabled
 * flag; the 100% (limit reached) alert is implicit and always fires.
 */
@Entity('tenant_limit_alert')
export class TenantLimitAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'tenant_id' })
  tenantId: string

  @ManyToOne(() => Tenant, { eager: false })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant

  @Column({ name: 'channel_code' })
  channelCode: string

  @Column({ name: 'warn_threshold_percent', type: 'smallint' })
  warnThresholdPercent: number

  @Column({ name: 'alerts_enabled', default: true })
  alertsEnabled: boolean

  @Column({ name: 'created_at' })
  createdAt: Date

  @Column({ nullable: true, name: 'created_by' })
  createdBy: string

  @Column({ name: 'updated_at' })
  updatedAt: Date

  @Column({ nullable: true, name: 'updated_by' })
  updatedBy: string
}
