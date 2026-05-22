import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { FeatureFlag } from './entities/feature-flag.entity'
import { FeatureFlagCode } from './entities/feature-flag-code.entity'
import { FeatureFlagService } from './feature-flag.service'
import { FeatureFlagController } from './feature-flag.controller'
import { FeatureFlagClientController } from './feature-flag.controller'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { ClientTenantMappingModule } from '../admin/client-tenant-mappings/client-tenant-mapping.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([FeatureFlag, FeatureFlagCode]),
    TenantsModule,
    ClientTenantMappingModule,
  ],
  providers: [FeatureFlagService],
  controllers: [FeatureFlagController, FeatureFlagClientController],
  exports: [FeatureFlagService],
})
export class FeatureFlagModule {}
