import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm'
import { TemplateEngineCode } from './template-engine-code.entity'
import { Tenant } from '../../admin/tenants/entities/tenant.entity'
import { NotificationChannelCode } from 'src/api/notification/entities/notification-channel-code.entity'

/**
 * Template entity representing a notification template.
 * Each template is scoped to a tenant and can be used to render notifications
 * across different channels (email, SMS, etc.).
 *
 * Supports versioning via the TemplateVersion table.
 */
@Entity('template')
@Index('idx_template_tenant_id', ['tenantId'])
@Index('idx_template_channel_code', ['channelCode'])
@Index('idx_template_engine_code', ['engineCode'])
@Index('idx_template_active', ['active'])
@Index('idx_template_created_at', ['createdAt'])
@Index('idx_template_tenant_active', ['tenantId', 'active'])
@Unique('unique_tenant_template_name', ['tenantId', 'name'])
export class Template {
  /**
   * Template ID (UUID)
   */
  @PrimaryGeneratedColumn('uuid')
  id: string

  /**
   * Tenant ID that owns this template
   */
  @Column({ name: 'tenant_id' })
  tenantId: string

  /**
   * Relationship to the owning tenant
   */
  @ManyToOne(() => Tenant, { eager: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant

  /**
   * Template name. Must be unique within the tenant.
   */
  @Column({ length: 255 })
  name: string

  /**
   * Optional description of what this template is for
   */
  @Column({ type: 'text', nullable: true })
  description?: string

  /**
   * Channel code (EMAIL, SMS, etc.)
   */
  @Column({ name: 'channel_code', length: 20 })
  channelCode: string

  /**
   * Relationship to the notification channel
   */
  @ManyToOne(() => NotificationChannelCode, { eager: true })
  @JoinColumn({ name: 'channel_code', referencedColumnName: 'channelCode' })
  channel: NotificationChannelCode

  /**
   * Email subject line. Only applicable for EMAIL templates.
   */
  @Column({ type: 'text', nullable: true })
  subject?: string

  /**
   * Template body content with placeholders.
   * Format depends on the selected engine.
   */
  @Column({ type: 'text' })
  body: string

  /**
   * Template rendering engine (legacy_gc_notify, handlebars, mustache, ejs)
   */
  @Column({ name: 'engine_code', length: 50, default: 'handlebars' })
  engineCode: string

  /**
   * Relationship to the template engine
   */
  @ManyToOne(() => TemplateEngineCode, { eager: true })
  @JoinColumn({ name: 'engine_code', referencedColumnName: 'engineCode' })
  engine: TemplateEngineCode

  /**
   * Current version number
   */
  @Column({ type: 'integer', default: 1 })
  version: number

  /**
   * Flag indicating if this is the active version
   */
  @Column({ type: 'boolean', default: true })
  active: boolean

  /**
   * User or process that created this template
   */
  @Column({ name: 'created_by', length: 200 })
  createdBy: string

  /**
   * Timestamp when the template was created
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  /**
   * User or process that last updated this template
   */
  @Column({ name: 'updated_by', length: 200 })
  updatedBy: string

  /**
   * Timestamp when the template was last updated
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
