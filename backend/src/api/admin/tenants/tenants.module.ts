import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Tenant } from './entities/tenant.entity'
import { TenantStatusCode } from './entities/tenant-status-code.entity'
import { TenantsController } from './tenants.controller'
import { TenantsService } from './tenants.service'
import { JwtGuard } from '../../../common/guards/jwt.guard'

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, TenantStatusCode])],
  controllers: [TenantsController],
  providers: [TenantsService, JwtGuard],
  exports: [TenantsService],
})
export class TenantsModule {}
