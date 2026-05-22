import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'
import { NotificationStatusCode } from './notification-status-code.entity'
import { NotificationChannelCode } from './notification-channel-code.entity'
import { Tenant } from '../../admin/tenants/entities/tenant.entity'

@Entity('notification_request')
export class NotificationRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'tenant_id' })
  tenantId: string

  @ManyToOne(() => Tenant, { eager: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant

  @Column({ name: 'status' })
  status: string

  @ManyToOne(() => NotificationStatusCode, { eager: true })
  @JoinColumn({ name: 'status', referencedColumnName: 'code' })
  statusCode: NotificationStatusCode

  @Column({ name: 'channel_code', nullable: true, length: 20 })
  channelCode?: string

  @ManyToOne(() => NotificationChannelCode, { eager: true })
  @JoinColumn({ name: 'channel_code', referencedColumnName: 'channelCode' })
  channel?: NotificationChannelCode

  @Column({ name: 'delayed_send_time', type: 'timestamptz', nullable: true })
  delayedSendTime?: Date

  @Column({ name: 'recipients', type: 'jsonb', nullable: true })
  recipients?: {
    email?: string[]
    sms?: string[]
    msgApp?: string[]
  }

  @Column({ name: 'payload', type: 'jsonb', nullable: true })
  payload?: any

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @Column({ nullable: true, name: 'created_by' })
  createdBy: string

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @Column({ nullable: true, name: 'updated_by' })
  updatedBy: string

  @Column({ type: 'text', nullable: true, name: 'error_reason' })
  errorReason?: string
}
