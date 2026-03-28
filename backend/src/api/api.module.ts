import { Module } from '@nestjs/common'
import { EmailModule } from './email/email.module'

/**
 * API Module
 * Groups all tenant-facing APIs (protected by API key)
 *
 * Modules:
 * - EmailModule: Email sending functionality
 *
 * Future modules:
 * - NotifyModule: Core notification sending (email, SMS, etc)
 * - WebhookModule: Webhook delivery
 * - StatusModule: Message tracking
 */
@Module({
  imports: [EmailModule],
  exports: [EmailModule],
})
export class ApiModule {}
