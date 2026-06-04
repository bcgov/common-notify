import { Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClientTenantMappingController } from './client-tenant-mapping.controller'
import { ClientTenantMappingService } from './client-tenant-mapping.service'
import { ClientTenantMapping } from './entities/client-tenant-mapping.entity'
import { Tenant } from '../tenants/entities/tenant.entity'
import { NotifyFrontendRoleGuard } from '../../../common/guards/notify-frontend-role.guard'
import { TenantsModule } from '../tenants/tenants.module'
import { CstarModule } from '../../../services/cstar/cstar.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([ClientTenantMapping, Tenant]),
    forwardRef(() => TenantsModule),
    CstarModule,
  ],
  controllers: [ClientTenantMappingController],
  providers: [ClientTenantMappingService, NotifyFrontendRoleGuard],
  exports: [ClientTenantMappingService],
})
export class ClientTenantMappingModule {}
