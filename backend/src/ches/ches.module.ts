import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Tenant } from '../api/admin/tenants/entities/tenant.entity'
import { ChesController } from './ches.controller'
import { ChesOAuthService } from './ches-oauth.service'
import { ChesApiClient } from './ches-api.client'
import { AdminModule } from '../api/admin/admin.module'
import { CstarModule } from '../services/cstar/cstar.module'
import { ApiKeysModule } from '../api/api-keys/api-keys.module'

@Module({
  imports: [TypeOrmModule.forFeature([Tenant]), AdminModule, CstarModule, ApiKeysModule],
  controllers: [ChesController],
  providers: [ChesOAuthService, ChesApiClient],
  exports: [ChesApiClient],
})
export class ChesModule {}
