import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm'

/**
 * Code table for the recipient lists an event channel can address (TO, CC, BCC).
 *
 * Which of them a given channel actually supports is held in notify.channel_recipient_kind,
 * which event_channel_recipient references - so SMS having no cc/bcc is data, not a constraint.
 */
@Entity('event_recipient_kind_code')
export class EventRecipientKindCode {
  @PrimaryColumn({ name: 'kind_code', length: 3 })
  kindCode: string

  @Column({ length: 255 })
  description: string

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @Column({ nullable: true, name: 'created_by' })
  createdBy: string

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date

  @Column({ nullable: true, name: 'updated_by' })
  updatedBy: string
}
