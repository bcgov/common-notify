import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm'
import { Tenant } from '../../admin/tenants/entities/tenant.entity'
import { numericTransformer } from '../../../common/transformers/numeric.transformer'

/**
 * TenantUsage Entity
 *
 * Rolling notification counters per (tenant, channel, period). One row per
 * (tenant, channel_code, period_type_code, period_start), incremented on each accepted send,
 * whether made with an API key or from the Notify UI (see migration V81).
 *
 * MINUTE/DAY buckets drive rate and daily checks; YEAR buckets drive the annual
 * check and are retained as per-fiscal-year history.
 */
@Entity('tenant_usage')
export class TenantUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'tenant_id' })
  tenantId: string

  @ManyToOne(() => Tenant, { eager: false })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant

  @Column({ name: 'channel_code' })
  channelCode: string

  @Column({ name: 'period_type_code' })
  periodTypeCode: string

  @Column({ name: 'period_start', type: 'timestamptz' })
  periodStart: Date

  @Column({ name: 'sent_count', type: 'bigint', transformer: numericTransformer })
  sentCount: number

  @Column({ name: 'created_at' })
  createdAt: Date

  @Column({ name: 'updated_at' })
  updatedAt: Date
}
