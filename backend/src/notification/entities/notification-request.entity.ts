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

@Entity('notification_request')
export class NotificationRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'tenant_id' })
  tenantId: string

  @Column({ name: 'status' })
  status: string

  @ManyToOne(() => NotificationStatusCode, { eager: true })
  @JoinColumn({ name: 'status', referencedColumnName: 'code' })
  statusCode: NotificationStatusCode

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
