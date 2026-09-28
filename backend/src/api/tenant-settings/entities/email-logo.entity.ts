import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('email_logo')
export class EmailLogo {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'varchar', nullable: true })
  name: string | null

  @Column({ type: 'varchar', nullable: true, name: 'file_key' })
  fileKey: string | null

  @Column({ type: 'varchar', name: 'source_code' })
  sourceCode: string

  @Column({ type: 'varchar', name: 'status_code' })
  statusCode: string

  @Column({ type: 'uuid', nullable: true, name: 'tenant_id' })
  tenantId: string | null

  @Column({ type: 'varchar', nullable: true, name: 'submitted_by' })
  submittedBy: string | null

  @Column({ type: 'varchar', nullable: true, name: 'approved_by' })
  approvedBy: string | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date

  @Column({ type: 'boolean', default: false, name: 'is_deleted' })
  isDeleted: boolean
}
