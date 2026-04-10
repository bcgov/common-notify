import { Module } from '@nestjs/common'
import { ChesController } from './v1/ches.controller'
import { ChesOAuthService } from './ches-oauth.service'
import { ChesApiClient } from './ches-api.client'
import { AdminModule } from '../admin/admin.module'
import { TenantGuard } from '../common/guards/tenant.guard'

@Module({
  imports: [AdminModule],
  controllers: [ChesController],
  providers: [ChesOAuthService, ChesApiClient, TenantGuard],
  exports: [ChesApiClient],
})
export class ChesModule {}
