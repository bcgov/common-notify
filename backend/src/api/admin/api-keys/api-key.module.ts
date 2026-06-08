import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ApiKey } from './entities/api-key.entity'
import { Tenant } from '../tenants/entities/tenant.entity'
import { ApiKeyService } from './api-key.service'
import { ApiKeyController } from './api-key.controller'
import { KongAdminApiClient } from '../../../services/kong/kong-admin-api.client'
import { TenantsModule } from '../tenants/tenants.module'
import { CstarModule } from '../../../services/cstar/cstar.module'

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey, Tenant]), TenantsModule, CstarModule],
  providers: [ApiKeyService, KongAdminApiClient],
  controllers: [ApiKeyController],
  exports: [ApiKeyService], // Export for other modules that need to track key usage
})
export class ApiKeyModule {}
