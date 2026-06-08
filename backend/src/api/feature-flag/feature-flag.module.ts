import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FeatureFlag } from './entities/feature-flag.entity'
import { FeatureFlagCode } from './entities/feature-flag-code.entity'
import { ApiKey } from '../admin/api-keys/entities/api-key.entity'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { FeatureFlagService } from './feature-flag.service'
import {
  FeatureFlagController,
  FeatureFlagClientController,
  FeatureFlagClientFrontendController,
} from './feature-flag.controller'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { ApiKeyModule } from '../admin/api-keys/api-key.module'
import { CstarModule } from '../../services/cstar/cstar.module'
import { NotifyAdminGuard } from '../../common/guards/notify-admin.guard'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { NotifyServiceGuard } from '../../common/guards/notify-service.guard'

@Module({
  imports: [
    TypeOrmModule.forFeature([FeatureFlag, FeatureFlagCode, ApiKey, Tenant]),
    TenantsModule,
    ApiKeyModule,
    CstarModule,
  ],
  providers: [FeatureFlagService, NotifyAdminGuard, NotifyFrontendRoleGuard, NotifyServiceGuard],
  controllers: [
    FeatureFlagController,
    FeatureFlagClientController,
    FeatureFlagClientFrontendController,
  ],
  exports: [FeatureFlagService],
})
export class FeatureFlagModule {}
