import { Module } from '@nestjs/common'
import { NotificationModule } from '../notification/notification.module'
import { McpRecipientsService } from './mcp-recipients.service'

@Module({
  imports: [NotificationModule],
  providers: [McpRecipientsService],
  exports: [McpRecipientsService],
})
export class McpModule {}
