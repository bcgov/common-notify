import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database.module';
import { McpClientModule } from './mcp-client/mcp-client.module';
import { McpServersModule } from './mcp-servers/mcp-servers.module';
import { TenantServicesModule } from './tenant-services/tenant-services.module';
import { ToolDefaultsModule } from './tool-defaults/tool-defaults.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.local'] }),
    DatabaseModule,
    McpServersModule,
    McpClientModule,
    ToolDefaultsModule,
    TenantServicesModule,
  ],
})
export class AppModule {}
