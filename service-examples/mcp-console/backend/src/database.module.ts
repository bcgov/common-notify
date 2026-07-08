import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpServerRegistration } from './mcp-servers/entities/mcp-server.entity';
import { TenantServiceSubscription } from './tenant-services/entities/tenant-service-subscription.entity';
import { ToolParameterDefault } from './tool-defaults/entities/tool-parameter-default.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5433', 10),
      username: process.env.POSTGRES_USER || 'mcp_console',
      password: process.env.POSTGRES_PASSWORD || 'mcp_console',
      database: process.env.POSTGRES_DATABASE || 'mcp_console',
      entities: [McpServerRegistration, ToolParameterDefault, TenantServiceSubscription],
      synchronize: false,
      logging: process.env.NODE_ENV !== 'production' ? ['error'] : ['error'],
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
