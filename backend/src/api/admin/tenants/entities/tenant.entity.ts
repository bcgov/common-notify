import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm'
import { TenantStatusCode } from './tenant-status-code.entity'

/**
 * Tenant Entity
 * Represents an organization or service using Notify.
 * All data in the system is scoped under a tenant.
 */
@Entity('tenant')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ nullable: true, name: 'external_id' })
  externalId: string

  @Column()
  name: string

  @Column({ unique: true })
  slug: string

  @ManyToOne(() => TenantStatusCode, { eager: true })
  @JoinColumn({ name: 'status', referencedColumnName: 'code' })
  statusCode: TenantStatusCode

  @Column({ insert: false, update: false, name: 'status' })
  status: string

  @Column({ name: 'created_at' })
  createdAt: Date

  @Column({ nullable: true, name: 'created_by' })
  createdBy: string

  @Column({ name: 'updated_at' })
  updatedAt: Date

  @Column({ nullable: true, name: 'updated_by' })
  updatedBy: string

  @Column({ default: false, name: 'is_deleted' })
  isDeleted: boolean

  /** Why an admin disabled sending; null while the tenant is active. */
  @Column({ type: 'varchar', length: 500, nullable: true, name: 'disabled_reason' })
  disabledReason: string | null

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'disabled_by' })
  disabledBy: string | null

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'disabled_by_name' })
  disabledByName: string | null

  @Column({ type: 'timestamptz', nullable: true, name: 'disabled_at' })
  disabledAt: Date | null
}
