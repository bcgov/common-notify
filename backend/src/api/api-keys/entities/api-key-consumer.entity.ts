import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm'
import { Tenant } from '../../../api/admin/tenants/entities/tenant.entity'

/**
 * ApiKeyConsumer Entity
 *
 * Stores the mapping between a Kong API key credential and a Notify tenant.
 *
 * The credential_identifier is the per-key ID forwarded by Kong's key-auth plugin
 * via the x-credential-identifier request header. It is never the raw key value.
 *
 * This mapping is created via the bind endpoint (POST /api/v1/service/api-key/bind)
 * where the user proves ownership of both:
 *   - the API key (by authenticating the request through Kong's key-auth)
 *   - the CSTAR tenant (by providing a valid JWT that passes membership verification)
 */
@Entity('api_key_consumer')
export class ApiKeyConsumer {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ unique: true, name: 'credential_identifier' })
  credentialIdentifier: string

  @Column({ nullable: true, name: 'consumer_id' })
  consumerId: string

  @Column({ name: 'tenant_id' })
  tenantId: string

  @ManyToOne(() => Tenant, { eager: false })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant

  @Column({ nullable: true, name: 'bound_by_idir_guid' })
  boundByIdirGuid: string

  @Column({ name: 'created_at' })
  createdAt: Date

  @Column({ name: 'updated_at' })
  updatedAt: Date
}
