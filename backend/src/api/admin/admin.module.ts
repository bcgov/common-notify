import { Module } from '@nestjs/common'
import { TenantsModule } from './tenants/tenants.module'
import { ClientTenantMappingModule } from './client-tenant-mappings/client-tenant-mapping.module'
import { UsersModule } from './users/users.module'

@Module({
  imports: [TenantsModule, ClientTenantMappingModule, UsersModule],
  exports: [TenantsModule, ClientTenantMappingModule, UsersModule],
})
export class AdminModule {}
