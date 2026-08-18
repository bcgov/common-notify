import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CstarModule } from '../../services/cstar/cstar.module'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { FeatureFlagModule } from '../feature-flag/feature-flag.module'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { RecipientSafelist } from './entities/recipient-safelist.entity'
import { SafelistController } from './safelist.controller'
import { SafelistService } from './safelist.service'

@Module({
  imports: [
    // NotifyUser is joined by listByTenant but never injected as a repository; its metadata
    // comes from the root DataSource.
    TypeOrmModule.forFeature([RecipientSafelist, NotifyConfiguration]),
    CstarModule,
    TenantsModule,
    FeatureFlagModule,
  ],
  providers: [SafelistService],
  controllers: [SafelistController],
  exports: [TypeOrmModule, SafelistService],
})
export class SafelistModule {}
