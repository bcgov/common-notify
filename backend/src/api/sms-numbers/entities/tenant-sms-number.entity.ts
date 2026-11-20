import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

/** The number a tenant sends from through one provider. One per tenant per provider. */
@Entity('tenant_sms_number', { schema: 'notify' })
export class TenantSmsNumber {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string

  @Column({ type: 'uuid', name: 'sms_number_id' })
  smsNumberId: string

  /** The number's provider, held equal to it by the composite foreign key. */
  @Column({ type: 'varchar', length: 20, name: 'provider_code' })
  providerCode: string

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'created_by' })
  createdBy: string | null

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'created_by_name' })
  createdByName: string | null
}
