import { Module } from '@nestjs/common'
import { CstarTenantAdminGuard } from './cstar-tenant-admin.guard'
import { CstarModule } from '../../../services/cstar/cstar.module'
import { CstarTenantAdminController } from './cstar-tenant-admin.controller'

@Module({
  imports: [CstarModule],
  controllers: [CstarTenantAdminController],
  providers: [CstarTenantAdminGuard],
})
export class CstarTenantAdminModule {}
