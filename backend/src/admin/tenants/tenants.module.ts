import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Tenant } from './entities/tenant.entity'
import { TenantsController } from './tenants.controller'
import { TenantsService } from './tenants.service'
import { KongModule } from '../../shared/kong/kong.module'
import { JwtGuard } from '../../common/guards/jwt.guard'

@Module({
  imports: [TypeOrmModule.forFeature([Tenant]), KongModule],
  controllers: [TenantsController],
  providers: [TenantsService, JwtGuard],
  exports: [TenantsService],
})
export class TenantsModule {}
