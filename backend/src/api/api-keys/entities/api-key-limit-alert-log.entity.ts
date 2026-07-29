import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm'
import { ApiKeyConsumer } from './api-key-consumer.entity'

export type LimitAlertLevel = 'WARN' | 'LIMIT_REACHED'
export type LimitAlertPeriod = 'DAY' | 'YEAR'

/**
 * ApiKeyLimitAlertLog Entity
 *
 * Deduplication and delivery-tracking record for API key limit alerts. One row per
 * (api_key_consumer, channel_code, period_type_code, period_start, alert_level)
 * claims a warning or limit-reached notification for a usage period (see migration V43).
 */
@Entity('api_key_limit_alert_log')
export class ApiKeyLimitAlertLog {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'api_key_consumer_id', type: 'uuid' })
  apiKeyConsumerId: string

  @ManyToOne(() => ApiKeyConsumer, { eager: false })
  @JoinColumn({ name: 'api_key_consumer_id' })
  apiKeyConsumer: ApiKeyConsumer

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
