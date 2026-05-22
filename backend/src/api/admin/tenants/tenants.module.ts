import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Tenant } from './entities/tenant.entity'
import { TenantStatusCode } from './entities/tenant-status-code.entity'
import { TenantsController } from './tenants.controller'
import { TenantsService } from './tenants.service'

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, TenantStatusCode])],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
