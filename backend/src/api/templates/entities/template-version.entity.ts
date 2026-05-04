import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm'
import { Template } from './template.entity'
import { TemplateEngineCode } from './template-engine-code.entity'
import { NotificationChannelCode } from '../../notification/entities/notification-channel-code.entity'

/**
 * TemplateVersion entity representing a historical version of a template.
 * Allows tracking changes to templates and rolling back to previous versions.
 *
 * Each version is immutable once created.
 */
@Entity('template_version')
@Index('idx_template_version_template_id', ['templateId'])
@Index('idx_template_version_created_at', ['createdAt'])
@Index('idx_template_version_template_version', ['templateId', 'version'])
@Unique('unique_template_version', ['templateId', 'version'])
export class TemplateVersion {
  /**
   * Version record ID (UUID)
   */
  @PrimaryGeneratedColumn('uuid')
  id: string

  /**
   * Template ID that this version belongs to
   */
  @Column({ name: 'template_id' })
  templateId: string

  /**
   * Relationship to the parent template
   */
  @ManyToOne(() => Template, {
    onDelete: 'CASCADE',
    eager: true,
  })
  @JoinColumn({ name: 'template_id' })
  template: Template

  /**
   * Version number (auto-incrementing)
   */
  @Column({ type: 'integer' })
  version: number

  /**
   * Template name at this version
   */
  @Column({ length: 255 })
  name: string

  /**
   * Template description at this version
   */
  @Column({ type: 'text', nullable: true })
  description?: string

  /**
   * Channel code at this version (EMAIL, SMS, etc.)
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
   * Email subject at this version (nullable for non-email templates)
   */
  @Column({ type: 'text', nullable: true })
  subject?: string

  /**
   * Template body content at this version
   */
  @Column({ type: 'text' })
  body: string

  /**
   * Template engine code at this version
   */
  @Column({ name: 'engine_code', length: 50 })
  engineCode: string

  /**
   * Relationship to the template engine
   */
  @ManyToOne(() => TemplateEngineCode, { eager: true })
  @JoinColumn({ name: 'engine_code', referencedColumnName: 'engineCode' })
  engine: TemplateEngineCode

  /**
   * User or process that created this version
   */
  @Column({ name: 'created_by', length: 200 })
  createdBy: string

  /**
   * Timestamp when this version was created
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date
}
