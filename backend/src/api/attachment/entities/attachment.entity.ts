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

@Entity('attachment')
export class AttachmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'tenant_id' })
  tenantId: string

  @ManyToOne(() => Tenant, { eager: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant

  @Column({ name: 'file_name', length: 255 })
  fileName: string

  @Column({ name: 'file_extension', length: 50 })
  fileExtension: string

  @Column({ name: 'mime_type', length: 255 })
  mimeType: string

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: string

  @Column({ name: 'storage_key', length: 1024, unique: true })
  storageKey: string

  @Column({ name: 'content_sha256', length: 64, type: 'char' })
  contentSha256: string

  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
  uploadedBy?: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
