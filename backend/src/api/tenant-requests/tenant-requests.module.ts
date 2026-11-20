import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenantRequest } from './entities/tenant-request.entity'
import { TenantRequestHistory } from './entities/tenant-request-history.entity'
import { TenantRequestHandlerRegistry } from './tenant-request-handler.registry'
import { TenantRequestsAdminController } from './tenant-requests-admin.controller'
import { TenantRequestsService } from './tenant-requests.service'

/**
 * The approval workflow for things tenants ask Notify admins for. A feature imports this module
 * and registers a TenantRequestHandler for its type; SmsNumbersModule is the first.
 */
@Module({
  imports: [TypeOrmModule.forFeature([TenantRequest, TenantRequestHistory])],
  providers: [TenantRequestsService, TenantRequestHandlerRegistry],
  controllers: [TenantRequestsAdminController],
  exports: [TenantRequestsService, TenantRequestHandlerRegistry],
})
export class TenantRequestsModule {}
