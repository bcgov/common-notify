import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ApiKeyConsumer } from './entities/api-key-consumer.entity'
import { TenantSettings } from '../tenant-settings/entities/tenant-settings.entity'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { ApiKeysService } from './api-keys.service'
import { ApiKeyIssuanceService } from './api-key-issuance.service'
import { ApiKeysController } from './api-keys.controller'
import { ApiKeysFrontendController } from './api-keys-frontend.controller'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { CstarModule } from '../../services/cstar/cstar.module'
import { CredentialIssuerModule } from '../../services/credential-issuer/credential-issuer.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKeyConsumer, TenantSettings, Tenant, NotifyConfiguration]),
    CstarModule,
    TenantsModule,
    CredentialIssuerModule,
  ],
  providers: [ApiKeysService, ApiKeyIssuanceService],
  controllers: [ApiKeysController, ApiKeysFrontendController],
  exports: [TypeOrmModule, ApiKeysService, ApiKeyIssuanceService],
})
export class ApiKeysModule {}
