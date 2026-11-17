import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/** A number Notify owns, hosted by one provider. See V84. */
@Entity('sms_number', { schema: 'notify' })
export class SmsNumber {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** E.164, or a 5-6 digit short code. */
  @Column({ type: 'varchar', length: 16, name: 'phone_number' })
  phoneNumber: string

  @Column({ type: 'varchar', length: 20, name: 'provider_code' })
  providerCode: string

  @Column({ type: 'varchar', length: 20, name: 'number_type_code' })
  numberTypeCode: string

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null

  /** What a tenant without a number of its own sends from, through this provider. One per provider. */
  @Column({ type: 'boolean', default: false, name: 'is_default' })
  isDefault: boolean

  @Column({ type: 'boolean', default: false, name: 'is_deleted' })
  isDeleted: boolean

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'created_by' })
  createdBy: string | null

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'updated_by' })
  updatedBy: string | null
}
