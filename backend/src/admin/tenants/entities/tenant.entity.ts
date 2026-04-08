import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm'

/**
 * Tenant Entity
 * Represents a multi-tenant organization that can request notifications
 *
 * Note: Actual API keys are stored in Kong.
 * This entity only stores tenant metadata and a reference to Kong consumer ID.
 */
@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ unique: true })
  name: string

  @Column({ nullable: true })
  description: string

  @Column({ nullable: true })
  organization: string

  @Column({ nullable: true, name: 'contact_email' })
  contactEmail: string

  @Column({ nullable: true, name: 'contact_name' })
  contactName: string

  /**
   * Kong consumer ID - reference to the consumer created in Kong
   * This links the tenant to its Kong identity for API key management
   */
  @Column({ unique: true, nullable: true, name: 'kong_consumer_id' })
  kongConsumerId: string

  /**
   * Kong consumer username - the unique identifier in Kong
   * Used to manage API keys and credentials
   */
  @Column({ unique: true, nullable: true, name: 'kong_username' })
  kongUsername: string

  /**
   * OAuth2 client ID - for OAuth2-based authentication (e.g., client credentials flow)
   * Maps the tenant to an OAuth2 client for token-based authentication
   */
  @Column({ unique: true, nullable: true, name: 'oauth2_client_id' })
  oauth2ClientId: string

  @Column({ default: 'active' })
  status: 'active' | 'inactive' | 'suspended'

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
