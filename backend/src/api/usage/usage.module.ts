import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenantLimit } from './entities/tenant-limit.entity'
import { TenantUsage } from './entities/tenant-usage.entity'
import { TenantLimitAlert } from './entities/tenant-limit-alert.entity'
import { TenantLimitAlertLog } from './entities/tenant-limit-alert-log.entity'
import { TenantSettings } from '../tenant-settings/entities/tenant-settings.entity'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { TenantUsageService } from './tenant-usage.service'
import { LimitAlertService } from './limit-alert.service'
import { TenantUsageFrontendController } from './tenant-usage-frontend.controller'
import { TenantUsageAdminController } from './tenant-usage-admin.controller'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { CstarModule } from '../../services/cstar/cstar.module'

/** Tenant notification usage, limits and limit alerts, counted on every accepted send. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantLimit,
      TenantUsage,
      TenantLimitAlert,
      TenantLimitAlertLog,
      TenantSettings,
      Tenant,
      NotifyConfiguration,
    ]),
    CstarModule,
    TenantsModule,
  ],
  providers: [TenantUsageService, LimitAlertService],
  controllers: [TenantUsageFrontendController, TenantUsageAdminController],
  exports: [TenantUsageService, LimitAlertService],
})
export class UsageModule {}
