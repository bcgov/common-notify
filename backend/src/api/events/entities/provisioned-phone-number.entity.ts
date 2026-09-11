import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'
import { Tenant } from '../../admin/tenants/entities/tenant.entity'

/**
 * Provisioned phone number entity
 *
 * Pool of SMS numbers provisioned from the SMS provider. A row with tenantId NULL is
 * available for allocation; a row with tenantId set is allocated to that tenant. A tenant
 * holds at most one live number and all of its SMS events send from it.
 */
@Entity('provisioned_phone_number')
export class ProvisionedPhoneNumber {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /**
   * The number in E.164 format (e.g. +12505551234)
   */
  @Column({ name: 'phone_number', length: 20 })
  phoneNumber: string

  /**
   * Optional label for the number
   */
  @Column({ name: 'display_name', type: 'varchar', length: 200, nullable: true })
  displayName: string | null

  /**
   * Informational name of the provider the number was provisioned from (e.g. twilio)
   */
  @Column({ type: 'varchar', length: 50, nullable: true })
  provider: string | null

  /**
   * Tenant the number is allocated to. NULL means the number is in the available pool.
   */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null

  /**
   * When the number was allocated to the current tenant. NULL while unallocated.
   */
  @Column({ name: 'allocated_at', type: 'timestamptz', nullable: true })
  allocatedAt: Date | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @Column({ name: 'created_by', type: 'varchar', length: 200, nullable: true })
  createdBy: string | null

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @Column({ name: 'updated_by', type: 'varchar', length: 200, nullable: true })
  updatedBy: string | null

  @Column({ name: 'is_deleted', default: false })
  isDeleted: boolean
}
