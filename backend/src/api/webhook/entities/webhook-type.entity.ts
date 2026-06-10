import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm'

@Entity('webhook_type')
export class WebhookTypeCode {
  @PrimaryColumn({ length: 20 })
  code: string

  @Column({ length: 255 })
  description: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @Column({ nullable: true, name: 'created_by' })
  createdBy?: string

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @Column({ nullable: true, name: 'updated_by' })
  updatedBy?: string
}
