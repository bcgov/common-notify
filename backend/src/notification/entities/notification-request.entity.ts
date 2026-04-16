import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm'
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

  @Column({ name: 'created_at' })
  createdAt: Date

  @Column({ nullable: true, name: 'created_by' })
  createdBy: string

  @Column({ name: 'updated_at' })
  updatedAt: Date

  @Column({ nullable: true, name: 'updated_by' })
  updatedBy: string
}
