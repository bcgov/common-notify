import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ApiKey } from './api-keys/entities/api-key.entity'
import { Tenant } from './tenants/entities/tenant.entity'
import { TenantsModule } from './tenants/tenants.module'
import { UsersModule } from './users/users.module'
import { ApiKeyModule } from './api-keys/api-key.module'
import { AuthModule as FrontendAuthModule } from '../auth/auth.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey, Tenant]),
    TenantsModule,
    UsersModule,
    ApiKeyModule,
    FrontendAuthModule,
  ],
  exports: [TenantsModule, UsersModule, ApiKeyModule, FrontendAuthModule],
})
export class AdminModule {}
