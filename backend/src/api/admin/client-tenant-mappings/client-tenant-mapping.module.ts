import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClientTenantMappingController } from './client-tenant-mapping.controller'
import { ClientTenantMappingService } from './client-tenant-mapping.service'
import { ClientTenantMapping } from './entities/client-tenant-mapping.entity'
import { Tenant } from '../tenants/entities/tenant.entity'

@Module({
  imports: [TypeOrmModule.forFeature([ClientTenantMapping, Tenant])],
  controllers: [ClientTenantMappingController],
  providers: [ClientTenantMappingService],
  exports: [ClientTenantMappingService],
})
export class ClientTenantMappingModule {}
