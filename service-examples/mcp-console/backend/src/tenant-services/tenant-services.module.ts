import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { McpServersModule } from '../mcp-servers/mcp-servers.module';
import { TenantServiceSubscription } from './entities/tenant-service-subscription.entity';
import { TenantServicesController } from './tenant-services.controller';
import { TenantServicesService } from './tenant-services.service';

@Module({
  imports: [TypeOrmModule.forFeature([TenantServiceSubscription]), McpServersModule],
  controllers: [TenantServicesController],
  providers: [TenantServicesService],
})
export class TenantServicesModule {}
