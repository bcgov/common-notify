import { Module } from '@nestjs/common'

/**
 * API Module
 * Groups all tenant-facing APIs (protected by API key)
 *
 * Future modules:
 * - NotifyModule: Core notification sending (email, SMS, etc)
 * - WebhookModule: Webhook delivery
 * - StatusModule: Message tracking
 */
@Module({
  imports: [],
  exports: [],
})
export class ApiModule {}
