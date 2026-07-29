import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm'
import { ApiKeyConsumer } from './api-key-consumer.entity'

/**
 * ApiKeyLimitAlertLog Entity
 *
 * Insert-only delivery and deduplication log for API key limit alerts. One row per
 * (api_key_consumer, channel_code, period_type_code, period_start, alert_level)
 * records a warning or limit-reached notification for a usage period (see migration V43).
 */
@Entity('api_key_limit_alert_log')
export class ApiKeyLimitAlertLog {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'api_key_consumer_id' })
  apiKeyConsumerId: string

  @ManyToOne(() => ApiKeyConsumer, { eager: false })
  @JoinColumn({ name: 'api_key_consumer_id' })
  apiKeyConsumer: ApiKeyConsumer

  @Column({ name: 'channel_code' })
  channelCode: string

  @Column({ name: 'period_type_code' })
  periodTypeCode: string

  @Column({ name: 'period_start', type: 'timestamptz' })
  periodStart: Date

  @Column({ name: 'alert_level' })
  alertLevel: string

  @Column({ name: 'notification_request_id', nullable: true })
  notificationRequestId: string

  @Column({ name: 'sent_at' })
  sentAt: Date
}
