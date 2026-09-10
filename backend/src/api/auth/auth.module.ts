import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { CstarModule } from '../../services/cstar/cstar.module'
import { TenantsModule } from '../admin/tenants/tenants.module'

@Module({
  imports: [TenantsModule, CstarModule],
  controllers: [AuthController],
  // Re-exported rather than provided here, so this module shares CstarModule's client and
  // its in-flight coalescing instead of running a second copy.
  exports: [CstarModule],
})
export class AuthModule {}
