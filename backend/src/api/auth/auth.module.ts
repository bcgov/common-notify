import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { CstarApiClient } from '../../services/cstar/cstar-api.client'
import { TenantsModule } from '../admin/tenants/tenants.module'

@Module({
  imports: [TenantsModule],
  controllers: [AuthController],
  providers: [CstarApiClient],
  exports: [CstarApiClient],
})
export class AuthModule {}
