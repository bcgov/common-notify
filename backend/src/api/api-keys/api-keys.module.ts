import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ApiKeyConsumer } from './entities/api-key-consumer.entity'
import { ApiKeyLimit } from './entities/api-key-limit.entity'
import { ApiKeyUsage } from './entities/api-key-usage.entity'
import { ApiKeyLimitAlert } from './entities/api-key-limit-alert.entity'
import { ApiKeyLimitAlertLog } from './entities/api-key-limit-alert-log.entity'
import { TenantSettings } from '../tenant-settings/entities/tenant-settings.entity'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { ApiKeysService } from './api-keys.service'
import { ApiKeyIssuanceService } from './api-key-issuance.service'
import { ApiKeyUsageService } from './api-key-usage.service'
import { LimitAlertService } from './limit-alert.service'
import { ApiKeysController } from './api-keys.controller'
import { ApiKeysFrontendController } from './api-keys-frontend.controller'
import { ApiKeyUsageFrontendController } from './api-key-usage-frontend.controller'
import { ApiKeyUsageAdminController } from './api-key-usage-admin.controller'
import { CstarModule } from '../../services/cstar/cstar.module'
import { CredentialIssuerModule } from '../../services/credential-issuer/credential-issuer.module'
import { TenantsModule } from '../admin/tenants/tenants.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApiKeyConsumer,
      ApiKeyLimit,
      ApiKeyUsage,
      ApiKeyLimitAlert,
      ApiKeyLimitAlertLog,
      TenantSettings,
      Tenant,
      NotifyConfiguration,
    ]),
    CstarModule,
    CredentialIssuerModule,
    TenantsModule,
  ],
  providers: [ApiKeysService, ApiKeyIssuanceService, ApiKeyUsageService, LimitAlertService],
  controllers: [
    ApiKeysController,
    ApiKeysFrontendController,
    ApiKeyUsageFrontendController,
    ApiKeyUsageAdminController,
  ],
  exports: [
    TypeOrmModule,
    ApiKeysService,
    ApiKeyIssuanceService,
    ApiKeyUsageService,
    LimitAlertService,
  ],
})
export class ApiKeysModule {}
