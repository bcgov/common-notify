import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm'
import { ApiKeyConsumer } from './api-key-consumer.entity'

/**
 * ApiKeyLimitAlert Entity
 *
 * Per-(API key, channel) limit-alert configuration. One row per
 * (api_key_consumer, channel_code), seeded when an API key is bound to a tenant
 * (see migration V41). Holds the warning threshold and an enabled flag; the 100%
 * (limit reached) alert is implicit and always fires.
 */
@Entity('api_key_limit_alert')
export class ApiKeyLimitAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'api_key_consumer_id' })
  apiKeyConsumerId: string

  @ManyToOne(() => ApiKeyConsumer, { eager: false })
  @JoinColumn({ name: 'api_key_consumer_id' })
  apiKeyConsumer: ApiKeyConsumer

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
