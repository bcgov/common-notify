import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

/**
 * One append-only row each time an SMS number request enters a status, written in the same
 * transaction as the change. No relations: history outlives what it describes.
 */
@Entity('sms_number_request_history', { schema: 'notify' })
export class SmsNumberRequestHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid', name: 'sms_number_request_id' })
  smsNumberRequestId: string

  @Column({ type: 'varchar', length: 20, name: 'status_code' })
  statusCode: string

  /** Required when rejecting; null otherwise. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null

  /** The number assigned or released. */
  @Column({ type: 'uuid', nullable: true, name: 'sms_number_id' })
  smsNumberId: string | null

  @Column({ type: 'varchar', length: 200, name: 'created_by' })
  createdBy: string

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'created_by_name' })
  createdByName: string | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date
}
