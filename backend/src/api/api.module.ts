import { Module } from '@nestjs/common'
import { EmailModule } from './email/email.module'
import { NotifyModule } from './notify/notify.module'

/**
 * API Module
 * Groups all tenant-facing APIs (protected by API key)
 *
 * Modules:
 * - EmailModule: Email sending functionality
 * - NotifyModule: Core notification sending (email, SMS, etc)
 *
 * Future modules:
 * - WebhookModule: Webhook delivery
 * - StatusModule: Message tracking
 */
@Module({
  imports: [EmailModule, NotifyModule],
  exports: [EmailModule, NotifyModule],
})
export class ApiModule {}
