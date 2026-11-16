import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm'
import { Tenant } from '../../admin/tenants/entities/tenant.entity'
import { numericTransformer } from '../../../common/transformers/numeric.transformer'

/**
 * TenantLimit Entity
 *
 * Configured notification limits per (tenant, channel). One row per (tenant, channel_code),
 * seeded when the tenant is created (see migration V81).
 *
 * The annual window boundary is global (notify.configuration key 'fiscal_year_start'),
 * not stored here.
 */
@Entity('tenant_limit')
export class TenantLimit {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'tenant_id' })
  tenantId: string

  @ManyToOne(() => Tenant, { eager: false })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant

  @Column({ name: 'channel_code' })
  channelCode: string

  @Column({ name: 'rate_limit_per_minute', type: 'int' })
  rateLimitPerMinute: number

  @Column({ name: 'daily_limit', type: 'bigint', transformer: numericTransformer })
  dailyLimit: number

  @Column({ name: 'annual_limit', type: 'bigint', transformer: numericTransformer })
  annualLimit: number

  @Column({ name: 'created_at' })
  createdAt: Date

  @Column({ nullable: true, name: 'created_by' })
  createdBy: string

  @Column({ name: 'updated_at' })
  updatedAt: Date

  @Column({ nullable: true, name: 'updated_by' })
  updatedBy: string
}
