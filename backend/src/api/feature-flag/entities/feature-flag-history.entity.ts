import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

/**
 * Feature Flag History Entity
 *
 * One append-only row per change to a feature flag: its creation and every enable/disable.
 * Written in the same transaction as the change itself.
 *
 * Deliberately has no relations: history outlives the flag (which is deleted with its tenant),
 * so code and tenantId are copied onto each row instead.
 */
@Entity('feature_flag_history', { schema: 'notify' })
export class FeatureFlagHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid', name: 'feature_flag_id' })
  featureFlagId: string

  @Column({ type: 'varchar', length: 255 })
  code: string

  /** Null for a global flag. */
  @Column({ type: 'uuid', nullable: true, name: 'tenant_id' })
  tenantId: string | null

  /** Value after the change. */
  @Column({ type: 'boolean' })
  enabled: boolean

  /** Stable user identifier, matching FeatureFlag.updatedBy. */
  @Column({ type: 'varchar', length: 200, name: 'created_by' })
  createdBy: string

  /** Display name at the time of the change, for the admin UI. */
  @Column({ type: 'varchar', length: 200, nullable: true, name: 'created_by_name' })
  createdByName: string | null

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date
}
