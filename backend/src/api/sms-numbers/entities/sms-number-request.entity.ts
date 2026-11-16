import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/** A tenant's request for an SMS number, and the admin's decision on it. */
@Entity('sms_number_request', { schema: 'notify' })
export class SmsNumberRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string

  @Column({ type: 'varchar', length: 20, name: 'status_code', default: 'pending' })
  statusCode: string

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'decided_by' })
  decidedBy: string | null

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'decided_by_name' })
  decidedByName: string | null

  @Column({ type: 'timestamptz', nullable: true, name: 'decided_at' })
  decidedAt: Date | null

  /** Why it was rejected. Shown to the tenant. */
  @Column({ type: 'varchar', length: 500, nullable: true, name: 'decision_reason' })
  decisionReason: string | null

  /** The number assigned on approval. */
  @Column({ type: 'uuid', nullable: true, name: 'sms_number_id' })
  smsNumberId: string | null

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'released_by' })
  releasedBy: string | null

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'released_by_name' })
  releasedByName: string | null

  @Column({ type: 'timestamptz', nullable: true, name: 'released_at' })
  releasedAt: Date | null

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'cancelled_by' })
  cancelledBy: string | null

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'cancelled_by_name' })
  cancelledByName: string | null

  @Column({ type: 'timestamptz', nullable: true, name: 'cancelled_at' })
  cancelledAt: Date | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date

  /** The tenant user who made the request. */
  @Column({ type: 'varchar', length: 200, nullable: true, name: 'created_by' })
  createdBy: string | null

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'created_by_name' })
  createdByName: string | null

  /** Whoever last changed the request's status. */
  @Column({ type: 'varchar', length: 200, nullable: true, name: 'updated_by' })
  updatedBy: string | null
}
