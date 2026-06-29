import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'
import { NotificationRequest } from './notification-request.entity'

@Entity('notification_request_detail')
export class NotificationRequestDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'notification_request_id' })
  notificationRequestId: string

  @Column({ name: 'batch_id', length: 255, nullable: true })
  batchId?: string

  @ManyToOne(() => NotificationRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notification_request_id' })
  notificationRequest: NotificationRequest

  @Column({ name: 'recipient_address', length: 255 })
  recipientAddress: string

  @Column({ length: 20, default: 'EMAIL' })
  channel: string

  @Column({ name: 'email_address_type', length: 10, nullable: true })
  emailAddressType?: 'primary' | 'cc' | 'bcc'

  @Column({ length: 20, default: 'pending' })
  status: string

  @Column({ name: 'provider_response_id', length: 255, nullable: true })
  providerResponseId?: string

  @Column({ name: 'provider_response', type: 'jsonb', nullable: true })
  providerResponse?: any

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string

  @Column({ name: 'attempt_count', default: 0 })
  attemptCount: number

  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true })
  lastAttemptAt?: Date

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @Column({ nullable: true, name: 'created_by' })
  createdBy?: string

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @Column({ nullable: true, name: 'updated_by' })
  updatedBy?: string
}
