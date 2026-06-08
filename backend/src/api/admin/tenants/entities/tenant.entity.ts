import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm'
import { TenantStatusCode } from './tenant-status-code.entity'

/**
 * Tenant Entity
 * Represents an organization or service using BC Notify.
 * All data in the system is scoped under a tenant.
 */
@Entity('tenant')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ nullable: true, name: 'external_id' })
  externalId: string

  /**
   * Kong consumer UUID - stores the Kong-assigned consumer ID for API key management
   * Set when the tenant is created and the consumer is created in Kong
   */
  @Column({ nullable: true, name: 'kong_consumer_id' })
  kongConsumerId: string

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
}
