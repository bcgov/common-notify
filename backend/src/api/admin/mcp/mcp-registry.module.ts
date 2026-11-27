import { Module } from '@nestjs/common'
import { NotifyAdminGuard } from '../../../common/guards/notify-admin.guard'
import { McpRegistryController } from './mcp-registry.controller'
import { McpRegistryService } from './mcp-registry.service'
import { FeatureFlagModule } from '../../feature-flag/feature-flag.module'
import { TenantsModule } from '../tenants/tenants.module'

@Module({
  imports: [FeatureFlagModule, TenantsModule],
  controllers: [McpRegistryController],
  providers: [McpRegistryService, NotifyAdminGuard],
})
export class McpRegistryModule {}
