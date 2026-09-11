import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm'
import { Tenant } from '../../../api/admin/tenants/entities/tenant.entity'

/** How a binding came to exist. */
export enum ApiKeyIssuedVia {
  /** Key requested in the API Services Portal, then bound via POST /service/api-key/bind. */
  BIND = 'bind',
  /** Key issued by Notify through the APS Credential Issuer API. */
  SELF_SERVICE = 'self-service',
}

/**
 * ApiKeyConsumer Entity
 *
 * Stores the mapping between a gateway API key credential and a Notify tenant.
 *
 * A binding is identified by either of two values, because the two ways of creating
 * one learn different things about the credential:
 *
 *   - `credentialIdentifier` — Kong's per-key ID, forwarded on every authenticated
 *     request as `x-credential-identifier`. Never the raw key value. Known up front
 *     for keys bound via POST /api/v1/service/api-key/bind, since that request
 *     arrives through Kong.
 *   - `clientId` — the gateway consumer id (`{environmentAppId}-{applicationAppId}`),
 *     returned by the APS Credential Issuer API. It is all we know for a self-issued
 *     key, so tenant resolution matches it against the consumer username Kong
 *     forwards and backfills `credentialIdentifier` on first use.
 *
 * Either way the user has proven ownership of both the key and the CSTAR tenant
 * before the row exists.
 */
@Entity('api_key_consumer')
export class ApiKeyConsumer {
  @PrimaryGeneratedColumn('uuid')
  id: string

  // Nullable columns declare their type explicitly: TypeScript reflects a `string | null`
  // property as `Object`, which TypeORM cannot map to a Postgres type.
  @Column({
    type: 'varchar',
    length: 512,
    unique: true,
    nullable: true,
    name: 'credential_identifier',
  })
  credentialIdentifier: string | null

  /** Gateway consumer id, `{environmentAppId}-{applicationAppId}`. */
  @Column({ type: 'varchar', length: 255, unique: true, nullable: true, name: 'client_id' })
  clientId: string | null

  /** Application half of {@link clientId}, kept for cross-environment Application reuse. */
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'application_app_id' })
  applicationAppId: string | null

  /**
   * Free-text note the tenant records against the key, typically where the key is
   * stored (a vault path, an OpenShift secret name). Notify never interprets it.
   */
  @Column({ type: 'varchar', length: 500, nullable: true, name: 'notes' })
  notes: string | null

  @Column({ nullable: true, name: 'consumer_id' })
  consumerId: string

  @Column({ name: 'tenant_id' })
  tenantId: string

  @ManyToOne(() => Tenant, { eager: false })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant

  @Column({ nullable: true, name: 'bound_by_idir_guid' })
  boundByIdirGuid: string

  @Column({ type: 'varchar', length: 20, name: 'issued_via', default: ApiKeyIssuedVia.BIND })
  issuedVia: ApiKeyIssuedVia

  @Column({ type: 'timestamp', nullable: true, name: 'issued_at' })
  issuedAt: Date | null

  @Column({ type: 'timestamp', nullable: true, name: 'last_regenerated_at' })
  lastRegeneratedAt: Date | null

  @Column({ name: 'created_at' })
  createdAt: Date

  @Column({ name: 'updated_at' })
  updatedAt: Date
}
