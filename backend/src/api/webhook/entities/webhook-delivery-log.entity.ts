import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm'
import { WebhookConfig } from './webhook-config.entity'

@Entity('webhook_delivery_log')
export class WebhookDeliveryLog {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'webhook_config_id' })
  webhookConfigId: string

  @ManyToOne(() => WebhookConfig)
  @JoinColumn({ name: 'webhook_config_id' })
  webhookConfig: WebhookConfig

  @Column({ name: 'notification_id', nullable: true })
  notificationId?: string

  @Column({ name: 'tenant_id' })
  tenantId: string

  @Column({ name: 'event_type', length: 100, nullable: true })
  eventType?: string

  @Column({ name: 'http_status_code', type: 'int', nullable: true })
  httpStatusCode?: number

  @Column({ name: 'response_body', type: 'text', nullable: true })
  responseBody?: string

  @Column({ name: 'attempt_number', default: 1 })
  attemptNumber: number

  @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true })
  nextRetryAt?: Date

  @Column({ length: 20, default: 'SENT' })
  status: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date
}
