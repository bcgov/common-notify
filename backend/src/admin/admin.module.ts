import { Module } from '@nestjs/common'
import { TenantsModule } from './tenants/tenants.module'
import { OAuth2Controller } from './oauth2.controller'

@Module({
  imports: [TenantsModule],
  controllers: [OAuth2Controller],
  exports: [TenantsModule],
})
export class AdminModule {}
