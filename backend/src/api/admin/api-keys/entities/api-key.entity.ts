import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm'
import { Tenant } from '../tenants/entities/tenant.entity'

/**
 * API Key Entity
 *
 * Stores metadata about API keys generated for tenants.
 * The actual key values are stored in Kong - we only track references and metadata.
 */
@Entity('api_key')
@Index(['tenantId']) // For quick lookup of keys by tenant
@Index(['kongKeyId']) // For quick lookup by Kong's key ID
@Index(['tenantId', 'revokedAt']) // For listing active keys per tenant
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @ManyToOne(() => Tenant, { eager: false })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant

  @Column({ name: 'tenant_id' })
  tenantId: string

  /**
   * Reference to the Kong consumer ID associated with this tenant.
   * Kong consumer is created per tenant and reused for all keys.
   */
  @Column({ name: 'kong_consumer_id' })
  kongConsumerId: string

  /**
   * Kong's internal ID for this specific API key credential.
   * Used when revoking the key from Kong.
   */
  @Column({ name: 'kong_key_id' })
  kongKeyId: string

  /**
   * User-friendly display name for this API key.
   * E.g., "Production Integration", "Mobile App Key", etc.
   */
  @Column({ name: 'display_name' })
  displayName: string

  /**
   * Optional description of the key's purpose.
   */
  @Column({ nullable: true, name: 'description' })
  description: string

  /**
   * How many times this key has been used.
   * Helps identify stale/unused keys.
   */
  @Column({ default: 0, name: 'usage_count' })
  usageCount: number

  /**
   * Last timestamp this key was used for authentication.
   * Null if never used.
   */
  @Column({ nullable: true, name: 'last_used_at' })
  lastUsedAt: Date

  /**
   * Timestamp when this key was revoked (if applicable).
   * Null means key is still active.
   */
  @Column({ nullable: true, name: 'revoked_at' })
  revokedAt: Date

  /**
   * User ID of the person who revoked this key.
   */
  @Column({ nullable: true, name: 'revoked_by' })
  revokedBy: string

  /**
   * Rate limit configuration (flexible for future use).
   * Can store rate limit tier, max requests per minute, custom limits, etc.
   * Stored as JSON for flexibility.
   * Example: { "tier": "standard", "rpm": 100 }
   */
  @Column({ type: 'jsonb', nullable: true, name: 'rate_limit_config' })
  rateLimitConfig: Record<string, any>

  /**
   * Timestamp when this API key was created.
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  /**
   * User ID of the person who created this key.
   */
  @Column({ nullable: true, name: 'created_by' })
  createdBy: string

  /**
   * Timestamp when this record was last updated.
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  /**
   * Computed property: whether this key is active (not revoked).
   */
  get isActive(): boolean {
    return !this.revokedAt
  }
}
