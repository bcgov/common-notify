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
import type { Relation } from 'typeorm'
import { NotifyEvent } from './event.entity'
import { ProvisionedPhoneNumber } from './provisioned-phone-number.entity'
import { Template } from '../../templates/entities/template.entity'
import { NotificationChannelCode } from '../../notification/entities/notification-channel-code.entity'

/**
 * Event channel setting
 *
 * One row per (event, channel), backing the Email settings and SMS settings tabs.
 * Channel-specific columns are constrained in the database so EMAIL rows carry
 * sender_email and SMS rows carry from_phone_number_id.
 */
@Entity('event_channel_setting')
@Index('idx_event_channel_setting_event', ['eventId'])
@Unique('uq_event_channel_setting', ['eventId', 'channelCode'])
export class EventChannelSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string

  @ManyToOne(() => NotifyEvent, (event) => event.channelSettings)
  @JoinColumn({ name: 'event_id' })
  event: Relation<NotifyEvent>

  @Column({ name: 'channel_code', length: 20 })
  channelCode: string

  @ManyToOne(() => NotificationChannelCode)
  @JoinColumn({ name: 'channel_code', referencedColumnName: 'channelCode' })
  channel: NotificationChannelCode

  /**
   * Active indicator for the channel. Can only be active when the channel
   * setting is properly filled out.
   */
  @Column({ default: false })
  active: boolean

  /**
   * Template used to render this channel
   */
  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId: string | null

  @ManyToOne(() => Template)
  @JoinColumn({ name: 'template_id' })
  template: Template | null

  /**
   * From address for EMAIL sends. NULL on SMS rows.
   */
  @Column({ name: 'sender_email', type: 'varchar', length: 320, nullable: true })
  senderEmail: string | null

  /**
   * Provisioned number used as the from number for SMS sends. NULL on EMAIL rows.
   */
  @Column({ name: 'from_phone_number_id', type: 'uuid', nullable: true })
  fromPhoneNumberId: string | null

  @ManyToOne(() => ProvisionedPhoneNumber)
  @JoinColumn({ name: 'from_phone_number_id' })
  fromPhoneNumber: ProvisionedPhoneNumber | null

  /**
   * Comma-separated, normalized recipients for this channel: lowercased/trimmed emails for
   * EMAIL rows, E.164 phone numbers for SMS rows. Required once active is true.
   */
  @Column({ name: 'to', type: 'varchar', length: 10000, nullable: true })
  to: string | null

  /**
   * Comma-separated, normalized CC email addresses. EMAIL only; NULL on SMS rows.
   */
  @Column({ type: 'varchar', length: 10000, nullable: true })
  cc: string | null

  /**
   * Comma-separated, normalized BCC email addresses. EMAIL only; NULL on SMS rows.
   */
  @Column({ type: 'varchar', length: 10000, nullable: true })
  bcc: string | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @Column({ name: 'created_by', type: 'varchar', length: 200, nullable: true })
  createdBy: string | null

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @Column({ name: 'updated_by', type: 'varchar', length: 200, nullable: true })
  updatedBy: string | null

  @Column({ name: 'is_deleted', default: false })
  isDeleted: boolean
}
