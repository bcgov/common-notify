import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpServerRegistration } from './entities/mcp-server.entity';
import { McpServersController } from './mcp-servers.controller';
import { McpServersService } from './mcp-servers.service';

@Module({
  imports: [TypeOrmModule.forFeature([McpServerRegistration])],
  controllers: [McpServersController],
  providers: [McpServersService],
  exports: [McpServersService],
})
export class McpServersModule {}
