import { Module } from '@nestjs/common'
import { TenantsModule } from './tenants/tenants.module'
import { ClientTenantMappingModule } from './client-tenant-mappings/client-tenant-mapping.module'

@Module({
  imports: [TenantsModule, ClientTenantMappingModule],
  exports: [TenantsModule, ClientTenantMappingModule],
})
export class AdminModule {}
