import { Module } from '@nestjs/common'
import { McpClientService } from './mcp-client.service'
import { McpGroupsService } from './mcp-groups.service'

@Module({
  providers: [McpClientService, McpGroupsService],
  exports: [McpClientService, McpGroupsService],
})
export class McpClientModule {}
