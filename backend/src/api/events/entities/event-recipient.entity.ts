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
import type { Relation } from 'typeorm'
import { EventChannelSetting } from './event-channel-setting.entity'

/**
 * Event recipient entity
 *
 * Manually entered recipients for an event channel. Stores both what the user typed and
 * the canonical form used for comparison and de-duplication, the same two-column
 * representation used by notify.recipient_safelist.
 */
@Entity('event_recipient')
@Index('idx_event_recipient_setting', ['eventChannelSettingId'])
export class EventRecipient {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'event_channel_setting_id', type: 'uuid' })
  eventChannelSettingId: string

  @ManyToOne(() => EventChannelSetting, (setting) => setting.recipients)
  @JoinColumn({ name: 'event_channel_setting_id' })
  channelSetting: Relation<EventChannelSetting>

  /**
   * Recipient exactly as entered by the user (email address or phone number)
   */
  @Column({ length: 320 })
  recipient: string

  /**
   * Canonical form: lowercased/trimmed for EMAIL, E.164 for SMS
   */
  @Column({ name: 'recipient_normalized', length: 320 })
  recipientNormalized: string

  @Column({ type: 'varchar', length: 200, nullable: true })
  label: string | null

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
