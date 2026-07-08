import { Module } from '@nestjs/common';
import { McpServersModule } from '../mcp-servers/mcp-servers.module';
import { McpClientController } from './mcp-client.controller';
import { McpClientFactory } from './mcp-client.factory';

@Module({
  imports: [McpServersModule],
  controllers: [McpClientController],
  providers: [McpClientFactory],
})
export class McpClientModule {}
