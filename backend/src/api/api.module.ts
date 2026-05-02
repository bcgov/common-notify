import { Module } from '@nestjs/common'
import { NotifyModule } from './notify/notify.module'
import { CodeTablesModule } from './code-tables/code-tables.module'
import { TemplatesModule } from './templates/templates.module'

/**
 * API Module
 * Groups all tenant-facing APIs (protected by API key)
 *
 * Modules:
 * - NotifyModule: Core notification sending (email, SMS, etc)
 * - CodeTablesModule: Reference code tables (statuses, channels, event types)
 * - TemplatesModule: Template management and rendering
 *
 * Future modules:
 * - WebhookModule: Webhook delivery
 * - StatusModule: Message tracking
 */
@Module({
  imports: [NotifyModule, CodeTablesModule, TemplatesModule],
  exports: [NotifyModule, CodeTablesModule, TemplatesModule],
})
export class ApiModule {}
