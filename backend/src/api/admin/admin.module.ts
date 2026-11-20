import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Tenant } from './tenants/entities/tenant.entity'
import { TenantsModule } from './tenants/tenants.module'
import { UsersModule } from './users/users.module'
import { AuthModule as FrontendAuthModule } from '../auth/auth.module'
import { McpRegistryModule } from './mcp/mcp-registry.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant]),
    TenantsModule,
    UsersModule,
    FrontendAuthModule,
    McpRegistryModule,
  ],
  exports: [TenantsModule, UsersModule, FrontendAuthModule],
})
export class AdminModule {}
