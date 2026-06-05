import { Module } from '@nestjs/common'
import { ChesController } from './ches.controller'
import { ChesOAuthService } from './ches-oauth.service'
import { ChesApiClient } from './ches-api.client'
import { AdminModule } from '../api/admin/admin.module'
import { CstarModule } from '../services/cstar/cstar.module'

@Module({
  imports: [AdminModule, CstarModule],
  controllers: [ChesController],
  providers: [ChesOAuthService, ChesApiClient],
  exports: [ChesApiClient],
})
export class ChesModule {}
