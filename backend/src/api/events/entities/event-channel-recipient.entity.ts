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
import { EventRecipientKindCode } from './event-recipient-kind-code.entity'
import { EventRecipientKind } from '../../../enum/event-recipient-kind.enum'

/**
 * Event channel recipient
 *
 * One row per manually entered recipient of an event channel. Addresses are stored normalized
 * (lowercased/trimmed email, E.164 phone number), which is what the database's format check and
 * the per-kind unique index rely on.
 *
 * Removal is a soft delete, so the history table keeps who was taken off an event and when.
 */
@Entity('event_channel_recipient')
@Index('idx_event_channel_recipient_setting', ['channelSettingId'])
export class EventChannelRecipient {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'channel_setting_id', type: 'uuid' })
  channelSettingId: string

  @ManyToOne(() => EventChannelSetting, (setting) => setting.recipients)
  @JoinColumn({ name: 'channel_setting_id' })
  channelSetting: Relation<EventChannelSetting>

  /**
   * Channel of the parent setting. Held identical to it by a composite foreign key in the
   * database, which is what lets the address format be checked on the row itself.
   */
  @Column({ name: 'channel_code', length: 20 })
  channelCode: string

  /**
   * Which recipient list the address belongs to. Paired with channelCode against
   * notify.channel_recipient_kind, so an SMS row can only be TO.
   *
   * Explicit varchar: TypeORM cannot infer a column type from a TypeScript enum, and without
   * it the DataSource fails to initialize ("Data type undefined ... is not supported").
   */
  @Column({ type: 'varchar', length: 3 })
  kind: EventRecipientKind

  @ManyToOne(() => EventRecipientKindCode)
  @JoinColumn({ name: 'kind', referencedColumnName: 'kindCode' })
  recipientKind: EventRecipientKindCode

  /**
   * The recipient, normalized: lowercased/trimmed email address, or E.164 phone number.
   */
  @Column({ length: 320 })
  address: string

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
