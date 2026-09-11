import { Module } from '@nestjs/common'
import { NotifyModule } from './notify/notify.module'
import { CodeTablesModule } from './code-tables/code-tables.module'
import { TemplatesModule } from './templates/templates.module'
import { AuthModule } from './auth/auth.module'
import { ApiKeysModule } from './api-keys/api-keys.module'
import { AttachmentModule } from './attachment/attachment.module'
import { TenantSettingsModule } from './tenant-settings/tenant-settings.module'
import { EventsModule } from './events/events.module'
import { SafelistModule } from './safelist/safelist.module'
import { EmailLogoModule } from './email-logo/email-logo.module'

/**
 * API Module
 * Groups all tenant-facing APIs (protected by API key)
 *
 * Modules:
 * - NotifyModule: Core notification sending (email, SMS, etc)
 * - CodeTablesModule: Reference code tables (statuses, channels, event types)
 * - TemplatesModule: Template management and rendering
 * - AuthModule: Frontend auth proxy for CSTAR
 *
 * Future modules:
 * - WebhookModule: Webhook delivery
 * - StatusModule: Message tracking
 */
@Module({
  imports: [
    NotifyModule,
    CodeTablesModule,
    TemplatesModule,
    AuthModule,
    ApiKeysModule,
    AttachmentModule,
    TenantSettingsModule,
    EventsModule,
    SafelistModule,
    EmailLogoModule,
  ],
  exports: [
    NotifyModule,
    CodeTablesModule,
    TemplatesModule,
    AuthModule,
    ApiKeysModule,
    AttachmentModule,
    TenantSettingsModule,
    EventsModule,
    SafelistModule,
    EmailLogoModule,
  ],
})
export class ApiModule {}
