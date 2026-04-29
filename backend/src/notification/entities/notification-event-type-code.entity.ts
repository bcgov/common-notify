import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm'

@Entity('notification_event_type_code')
export class NotificationEventTypeCode {
  @PrimaryColumn({ name: 'event_type_code', length: 50 })
  eventTypeCode: string

  @Column({ length: 255 })
  description: string

  @Column({ default: false })
  is_mandatory: boolean

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @Column({ nullable: true, name: 'created_by' })
  createdBy: string

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @Column({ nullable: true, name: 'updated_by' })
  updatedBy: string
}
