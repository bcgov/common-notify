import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/**
 * A recipient a tenant is permitted to send to while safelist enforcement is active.
 *
 * Enforcement is an environment guardrail, not a tenant preference: it applies to every tenant
 * in environments where the `recipient_safelist` feature flag is enabled (PR/DEV/TEST) and to
 * none in PROD, where the flag stays off. See migration V47.
 */
@Entity('recipient_safelist')
export class RecipientSafelist {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string

  @ApiProperty()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string

  @ApiProperty({ enum: ['EMAIL', 'SMS'] })
  @Column({ type: 'varchar', length: 20, name: 'channel_code' })
  channelCode: string

  /** The value exactly as the administrator typed it. Shown back in the UI. */
  @ApiProperty()
  @Column({ type: 'varchar', length: 320 })
  recipient: string

  /** Canonical form the send path compares against (lowercased email / E.164 phone number). */
  @ApiProperty()
  @Column({ type: 'varchar', length: 320, name: 'recipient_normalized' })
  recipientNormalized: string

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  label: string | null

  @ApiProperty()
  @Column({ name: 'created_at' })
  createdAt: Date

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'varchar', length: 200, nullable: true, name: 'created_by' })
  createdBy: string | null

  @ApiProperty()
  @Column({ name: 'updated_at' })
  updatedAt: Date

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'varchar', length: 200, nullable: true, name: 'updated_by' })
  updatedBy: string | null

  @Column({ default: false, name: 'is_deleted' })
  isDeleted: boolean
}
