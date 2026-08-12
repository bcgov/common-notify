import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm'
import { Tenant } from '../../admin/tenants/entities/tenant.entity'
import { EventChannelSetting } from './event-channel-setting.entity'

/**
 * Event entity
 *
 * A tenant-owned, named notification definition, configured through the Event settings tab.
 * Per-channel configuration lives in EventChannelSetting and recipients in EventRecipient.
 *
 * Named NotifyEvent rather than Event to avoid shadowing the global DOM Event type,
 * matching the NotifyUser / NotifyConfiguration convention.
 */
@Entity('event')
@Index('idx_event_tenant', ['tenantId'])
export class NotifyEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant

  @Column({ length: 200 })
  name: string

  @Column({ type: 'text', nullable: true })
  description: string | null

  @OneToMany(() => EventChannelSetting, (setting) => setting.event)
  channelSettings: EventChannelSetting[]

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
