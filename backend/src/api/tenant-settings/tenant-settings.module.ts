import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CstarModule } from '../../services/cstar/cstar.module'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { EmailLogoModule } from '../email-logo/email-logo.module'
import { TenantSettings } from './entities/tenant-settings.entity'
import { TenantSettingsController } from './tenant-settings.controller'
import { TenantSettingsService } from './tenant-settings.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantSettings]),
    CstarModule,
    TenantsModule,
    EmailLogoModule,
  ],
  providers: [TenantSettingsService],
  controllers: [TenantSettingsController],
  exports: [TypeOrmModule, TenantSettingsService],
})
export class TenantSettingsModule {}
