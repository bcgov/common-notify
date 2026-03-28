import { Module } from '@nestjs/common'
import { TenantsModule } from './tenants/tenants.module'

@Module({
  imports: [TenantsModule],
  exports: [TenantsModule],
})
export class AdminModule {}
