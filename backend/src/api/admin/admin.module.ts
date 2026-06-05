import { Module } from '@nestjs/common'
import { TenantsModule } from './tenants/tenants.module'
import { ClientTenantMappingModule } from './client-tenant-mappings/client-tenant-mapping.module'
import { UsersModule } from './users/users.module'
import { ApiKeyModule } from './api-keys/api-key.module'
import { AuthModule as FrontendAuthModule } from '../auth/auth.module'

@Module({
  imports: [
    TenantsModule,
    ClientTenantMappingModule,
    UsersModule,
    ApiKeyModule,
    FrontendAuthModule,
  ],
  exports: [
    TenantsModule,
    ClientTenantMappingModule,
    UsersModule,
    ApiKeyModule,
    FrontendAuthModule,
  ],
})
export class AdminModule {}
