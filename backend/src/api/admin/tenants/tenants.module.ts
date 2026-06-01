import { Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Tenant } from './entities/tenant.entity'
import { TenantStatusCode } from './entities/tenant-status-code.entity'
import { TenantsController } from './tenants.controller'
import { TenantsService } from './tenants.service'
import { NotifyFrontendRoleGuard } from '../../../common/guards/notify-frontend-role.guard'
import { ClientTenantMappingModule } from '../client-tenant-mappings/client-tenant-mapping.module'
import { CstarModule } from '../../../services/cstar/cstar.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, TenantStatusCode]),
    forwardRef(() => ClientTenantMappingModule),
    CstarModule,
  ],
  controllers: [TenantsController],
  providers: [TenantsService, NotifyFrontendRoleGuard],
  exports: [TenantsService],
})
export class TenantsModule {}
