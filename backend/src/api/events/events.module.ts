import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CstarModule } from '../../services/cstar/cstar.module'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { EmailLogoModule } from '../email-logo/email-logo.module'
import { FeatureFlagModule } from '../feature-flag/feature-flag.module'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'
import { PhoneNumberService } from '../notify/services/phone-number.service'
import { NotifyEvent } from './entities/event.entity'
import { EventChannelSetting } from './entities/event-channel-setting.entity'
import { ProvisionedPhoneNumber } from './entities/provisioned-phone-number.entity'
import { EventsFrontendController } from './events-frontend.controller'
import { EventsService } from './events.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([NotifyEvent, EventChannelSetting, ProvisionedPhoneNumber]),
    TenantsModule,
    CstarModule,
    FeatureFlagModule,
    EmailLogoModule,
  ],
  controllers: [EventsFrontendController],
  providers: [EventsService, NotifyFrontendRoleGuard, FeatureFlagGuard, PhoneNumberService],
  exports: [EventsService],
})
export class EventsModule {}
