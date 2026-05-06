import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm'
import { Tenant } from '../../tenants/entities/tenant.entity'

/**
 * ClientTenantMapping Entity
 *
 * Maps API Gateway client IDs to CSTAR tenants, enabling service-to-service access.
 * Links OAuth2 client credentials (issued via API Portal) to authorized tenants.
 *
 * Security:
 * - One client_id can map to multiple tenants (one app serves multiple organizations)
 * - Mapping verified through OAuth2 client credentials exchange (client_secret exchanged for token)
 * - client_id extracted from token claims and stored (secret never persisted)
 *
 * Audit:
 * - created_by tracks which admin authorized the client
 * - Soft delete preserves historical mapping records for audit trails
 */
@Entity('client_tenant_mapping')
@Index('idx_client_tenant_mapping_client_id', ['clientId'], {
  where: 'is_deleted = false AND is_active = true',
})
@Index('idx_client_tenant_mapping_tenant_id', ['tenantId'], {
  where: 'is_deleted = false AND is_active = true',
})
@Index('idx_client_tenant_mapping_active', ['clientId', 'tenantId'], {
  where: 'is_deleted = false AND is_active = true',
})
@Unique('uk_client_tenant_mapping', ['clientId', 'tenantId'])
export class ClientTenantMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'client_id', type: 'varchar', length: 255 })
  clientId: string

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string

  @ManyToOne(() => Tenant, { eager: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant

  @Column({ name: 'is_active', default: true })
  isActive: boolean

  @Column({ name: 'created_at' })
  createdAt: Date

  @Column({ name: 'created_by', type: 'varchar', length: 200 })
  createdBy: string

  @Column({ name: 'updated_at' })
  updatedAt: Date

  @Column({ name: 'updated_by', type: 'varchar', length: 200, nullable: true })
  updatedBy: string

  @Column({ name: 'is_deleted', default: false })
  isDeleted: boolean
}
