import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { CstarApiClient } from '../../services/cstar/cstar-api.client'

@Module({
  controllers: [AuthController],
  providers: [CstarApiClient],
  exports: [CstarApiClient],
})
export class AuthModule {}
