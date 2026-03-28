import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Tenant } from './entities/tenant.entity'
import { TenantsController } from './tenants.controller'
import { TenantsService } from './tenants.service'
import { KongModule } from '../../shared/kong/kong.module'

@Module({
  imports: [TypeOrmModule.forFeature([Tenant]), KongModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
