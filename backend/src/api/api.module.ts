import { Module } from '@nestjs/common'
import { NotifyModule } from './notify/notify.module'

/**
 * API Module
 * Groups all tenant-facing APIs (protected by API key)
 *
 * Modules:
 * - NotifyModule: Core notification sending (email, SMS, etc)
 *
 * Future modules:
 * - WebhookModule: Webhook delivery
 * - StatusModule: Message tracking
 */
@Module({
  imports: [NotifyModule],
  exports: [NotifyModule],
})
export class ApiModule {}
