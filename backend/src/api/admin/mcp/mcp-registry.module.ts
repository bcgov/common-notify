import { Module } from '@nestjs/common'
import { NotifyAdminGuard } from '../../../common/guards/notify-admin.guard'
import { McpRegistryController } from './mcp-registry.controller'
import { McpRegistryService } from './mcp-registry.service'

@Module({ controllers: [McpRegistryController], providers: [McpRegistryService, NotifyAdminGuard] })
export class McpRegistryModule {}
