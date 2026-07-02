import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm'
import { ApiKeyConsumer } from './api-key-consumer.entity'
import { numericTransformer } from '../../../common/transformers/numeric.transformer'

/**
 * ApiKeyUsage Entity
 *
 * Rolling notification counters per (API key, channel, period). One row per
 * (api_key_consumer, channel_code, period_type_code, period_start), incremented on
 * each accepted send (see migration V40).
 *
 * MINUTE/DAY buckets drive rate and daily checks; YEAR buckets drive the annual
 * check and are retained as per-fiscal-year history.
 */
@Entity('api_key_usage')
export class ApiKeyUsage {
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

  @Column({ name: 'sent_count', type: 'bigint', transformer: numericTransformer })
  sentCount: number

  @Column({ name: 'created_at' })
  createdAt: Date

  @Column({ name: 'updated_at' })
  updatedAt: Date
}
