import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'
import { Tenant } from '../../admin/tenants/entities/tenant.entity'
import { FeatureFlagCode } from './feature-flag-code.entity'

/**
 * Feature Flag Entity
 *
 * Represents feature toggles that can be enabled/disabled globally or per-tenant.
 * Resolution strategy: tenant-specific flag > global flag > default false
 *
 * Examples:
 * - (code='sms_notifications', tenant_id=NULL, enabled=FALSE) - Global: SMS disabled
 * - (code='sms_notifications', tenant_id=UUID, enabled=TRUE) - Override: Enabled for this tenant
 */
@Entity('feature_flag', { schema: 'notify' })
export class FeatureFlag {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /**
   * Feature code identifier (foreign key to feature_flag_code lookup table)
   * Examples: 'sms_notifications', 'sse_notifications', 'dashboard'
   */
  @Column({ type: 'varchar', length: 255 })
  code: string

  /**
   * Whether this feature is enabled (true) or disabled (false)
   * Defaults to false (safer: disabled by default)
   */
  @Column({ type: 'boolean', default: false })
  enabled: boolean

  /**
   * Tenant ID for tenant-specific overrides
   * NULL = global flag applies to all tenants
   * UUID = tenant-specific override
   */
  @Column({ type: 'uuid', nullable: true, name: 'tenant_id' })
  tenantId?: string

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant?: Tenant

  @ManyToOne(() => FeatureFlagCode, { nullable: false, eager: false })
  @JoinColumn({ name: 'code', referencedColumnName: 'code' })
  flagCode?: FeatureFlagCode

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'created_by' })
  createdBy?: string

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'updated_by' })
  updatedBy?: string
}
