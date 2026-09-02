import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('tenant_settings')
export class TenantSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId: string

  @Column({ type: 'varchar', nullable: true, length: 320, name: 'alert_email' })
  alertEmail: string | null

  @Column({ type: 'uuid', nullable: true, name: 'email_logo_id' })
  emailLogoId: string | null

  @Column({ type: 'varchar', nullable: true, length: 64, name: 'default_sender_email' })
  defaultSenderEmail: string | null

  @Column({ default: true, name: 'email_notifications_enabled' })
  emailNotificationsEnabled: boolean

  @Column({ type: 'varchar', nullable: true, length: 64, name: 'reply_to_email' })
  replyToEmail: string | null

  @Column({ default: false, name: 'use_custom_email_header' })
  useCustomEmailHeader: boolean

  @Column({ type: 'varchar', nullable: true, length: 60, name: 'custom_email_header_title' })
  customEmailHeaderTitle: string | null

  @Column({ default: true, name: 'email_attachments_enabled' })
  emailAttachmentsEnabled: boolean

  @Column({ default: true, name: 'sms_notifications_enabled' })
  smsNotificationsEnabled: boolean

  @Column({ default: true, name: 'include_tenant_name_in_sms' })
  includeTenantNameInSms: boolean

  @Column({ default: false, name: 'international_sms_enabled' })
  internationalSmsEnabled: boolean

  @Column({ name: 'created_at' })
  createdAt: Date

  @Column({ type: 'varchar', nullable: true, length: 200, name: 'created_by' })
  createdBy: string | null

  @Column({ name: 'updated_at' })
  updatedAt: Date

  @Column({ type: 'varchar', nullable: true, length: 200, name: 'updated_by' })
  updatedBy: string | null

  @Column({ default: false, name: 'is_deleted' })
  isDeleted: boolean
}
