import { Entity, Column, PrimaryColumn } from 'typeorm'

@Entity('notification_status_code')
export class NotificationStatusCode {
  @PrimaryColumn({ length: 20 })
  code: string

  @Column({ length: 255 })
  description: string

  @Column({ name: 'created_at' })
  createdAt: Date

  @Column({ nullable: true, name: 'created_by' })
  createdBy: string

  @Column({ name: 'updated_at' })
  updatedAt: Date

  @Column({ nullable: true, name: 'updated_by' })
  updatedBy: string
}
