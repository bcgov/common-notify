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
 * CSTAR group addressed by an event channel
 *
 * One row per group per recipient list, so a list can address any number of groups. Only the
 * group ID is held here - the members behind it are resolved from CSTAR when the notification is
 * sent, so a group gaining or losing people needs no change to the event.
 *
 * Removal is a soft delete, so the history table keeps which groups were taken off an event.
 */
@Entity('event_channel_cstar_group')
@Index('idx_event_channel_cstar_group_setting', ['channelSettingId'])
export class EventChannelCstarGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'channel_setting_id', type: 'uuid' })
  channelSettingId: string

  @ManyToOne(() => EventChannelSetting, (setting) => setting.cstarGroups)
  @JoinColumn({ name: 'channel_setting_id' })
  channelSetting: Relation<EventChannelSetting>

  /**
   * Channel of the parent setting. Held identical to it by a composite foreign key in the
   * database, which is what lets the kind be checked against the channel. Always EMAIL for now.
   */
  @Column({ name: 'channel_code', length: 20 })
  channelCode: string

  /**
   * Which recipient list the group is addressed through. Paired with channelCode against
   * notify.channel_recipient_kind.
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
   * Identifier of the CSTAR group. Not a foreign key - groups are owned by CSTAR - so the
   * service validates that it belongs to the event's tenant before it is written.
   */
  @Column({ name: 'cstar_group_id', length: 200 })
  cstarGroupId: string

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
