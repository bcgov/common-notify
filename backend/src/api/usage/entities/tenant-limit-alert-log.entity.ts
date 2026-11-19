import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm'
import { Tenant } from '../../admin/tenants/entities/tenant.entity'

export type LimitAlertLevel = 'WARN' | 'LIMIT_REACHED'
export type LimitAlertPeriod = 'DAY' | 'YEAR'

/**
 * TenantLimitAlertLog Entity
 *
 * Deduplication and delivery-tracking record for tenant limit alerts. One row per
 * (tenant, channel_code, period_type_code, period_start, alert_level) claims a warning or
 * limit-reached notification for a usage period (see migration V81).
 */
@Entity('tenant_limit_alert_log')
export class TenantLimitAlertLog {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string

  @ManyToOne(() => Tenant, { eager: false })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant

  @Column({ name: 'channel_code', type: 'varchar', length: 20 })
  channelCode: string

  @Column({ name: 'period_type_code', type: 'varchar', length: 20 })
  periodTypeCode: LimitAlertPeriod

  @Column({ name: 'period_start', type: 'timestamptz' })
  periodStart: Date

  @Column({ name: 'alert_level', type: 'varchar', length: 20 })
  alertLevel: LimitAlertLevel

  @Column({ name: 'notification_request_id', type: 'uuid', nullable: true })
  notificationRequestId: string | null

  @Column({ name: 'claimed_at', type: 'timestamptz' })
  claimedAt: Date

  @Column({ name: 'enqueued_at', type: 'timestamptz', nullable: true })
  enqueuedAt: Date | null
}
