import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm'
import { ApiKeyConsumer } from './api-key-consumer.entity'
import { numericTransformer } from '../../../common/transformers/numeric.transformer'

/**
 * ApiKeyLimit Entity
 *
 * Configured notification limits per (API key, channel). One row per
 * (api_key_consumer, channel_code). Populated once when an API key is linked to a
 * tenant during onboarding (see migration V40).
 *
 * The annual window boundary is global (notify.configuration key 'fiscal_year_start'),
 * not stored here.
 */
@Entity('api_key_limit')
export class ApiKeyLimit {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'api_key_consumer_id' })
  apiKeyConsumerId: string

  @ManyToOne(() => ApiKeyConsumer, { eager: false })
  @JoinColumn({ name: 'api_key_consumer_id' })
  apiKeyConsumer: ApiKeyConsumer

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
