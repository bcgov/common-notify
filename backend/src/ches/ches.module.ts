import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ApiKey } from '../api/admin/api-keys/entities/api-key.entity'
import { Tenant } from '../api/admin/tenants/entities/tenant.entity'
import { ChesController } from './ches.controller'
import { ChesOAuthService } from './ches-oauth.service'
import { ChesApiClient } from './ches-api.client'
import { AdminModule } from '../api/admin/admin.module'
import { CstarModule } from '../services/cstar/cstar.module'

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey, Tenant]), AdminModule, CstarModule],
  controllers: [ChesController],
  providers: [ChesOAuthService, ChesApiClient],
  exports: [ChesApiClient],
})
export class ChesModule {}
