import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CstarModule } from '../../services/cstar/cstar.module'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { FeatureFlagModule } from '../feature-flag/feature-flag.module'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { NotifyUser } from '../admin/users/entities/notify-user.entity'
import { RecipientSafelist } from './entities/recipient-safelist.entity'
import { SafelistController } from './safelist.controller'
import { SafelistService } from './safelist.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([RecipientSafelist, NotifyConfiguration, NotifyUser]),
    CstarModule,
    TenantsModule,
    FeatureFlagModule,
  ],
  providers: [SafelistService],
  controllers: [SafelistController],
  exports: [TypeOrmModule, SafelistService],
})
export class SafelistModule {}
