import { Module } from '@nestjs/common'
import { NotificationModule } from '../notification/notification.module'
import { McpRecipientsService } from './mcp-recipients.service'
import { McpController } from './mcp.controller'
import { ApiKeysModule } from '../api-keys/api-keys.module'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { FeatureFlagModule } from '../feature-flag/feature-flag.module'
import { NotifyServiceGuard } from '../../common/guards/notify-service.guard'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'

@Module({
  imports: [NotificationModule, ApiKeysModule, TenantsModule, FeatureFlagModule],
  controllers: [McpController],
  providers: [McpRecipientsService, NotifyServiceGuard, FeatureFlagGuard],
  exports: [McpRecipientsService],
})
export class McpModule {}
