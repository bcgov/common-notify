import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('tenant_settings')
export class TenantSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string

  @Column({ type: 'varchar', nullable: true, length: 320, name: 'alert_email' })
  alertEmail: string | null

  @Column({ name: 'created_at' })
  createdAt: Date

  @Column({ type: 'varchar', nullable: true, length: 200, name: 'created_by' })
  createdBy: string | null

  @Column({ name: 'updated_at' })
  updatedAt: Date

  @Column({ type: 'varchar', nullable: true, length: 200, name: 'updated_by' })
  updatedBy: string | null

  @Column({ default: false, name: 'is_deleted' })
  isDeleted: boolean
}
