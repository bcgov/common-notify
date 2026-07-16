import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm'

@Entity('configuration')
export class NotifyConfiguration {
  @PrimaryColumn({ length: 255 })
  key: string

  @Column({ type: 'jsonb' })
  config: {
    value?: unknown
    type?: string
    description?: string
  }

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @Column({ nullable: true, name: 'created_by' })
  createdBy: string

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @Column({ nullable: true, name: 'updated_by' })
  updatedBy: string
}
