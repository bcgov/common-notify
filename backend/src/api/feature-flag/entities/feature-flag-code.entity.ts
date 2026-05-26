import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

/**
 * Feature Flag Code Lookup Table Entity
 *
 * Defines all valid feature flag codes that can be used in the system.
 * Follows the notification_channel_code pattern for consistency.
 *
 * Examples: 'sms_notifications', 'sse_notifications', 'dashboard'
 */
@Entity('feature_flag_code', { schema: 'notify' })
export class FeatureFlagCode {
  /**
   * Feature code identifier (primary key)
   * Examples: 'sms_notifications', 'sse_notifications', 'dashboard'
   */
  @PrimaryColumn({ type: 'varchar', length: 255 })
  code: string

  /**
   * Human-readable display name for this feature
   * Examples: 'SMS Notifications', 'Server-Sent Events', 'Dashboard'
   */
  @Column({ type: 'varchar', length: 100, name: 'display_name' })
  displayName: string

  /**
   * Detailed description of what this feature does
   */
  @Column({ type: 'varchar', length: 255 })
  description: string

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'created_by' })
  createdBy?: string

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'updated_by' })
  updatedBy?: string
}
