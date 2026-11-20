import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Tenant } from './tenants/entities/tenant.entity'
import { TenantsModule } from './tenants/tenants.module'
import { UsersModule } from './users/users.module'
import { AuthModule as FrontendAuthModule } from '../auth/auth.module'
import { CstarAdminModule } from './cstar/cstar-admin.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant]),
    TenantsModule,
    UsersModule,
    FrontendAuthModule,
    CstarAdminModule,
  ],
  exports: [TenantsModule, UsersModule, FrontendAuthModule],
})
export class AdminModule {}
