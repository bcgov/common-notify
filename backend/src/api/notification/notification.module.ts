import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotificationRequest } from './entities/notification-request.entity'
import { NotificationRequestDetail } from './entities/notification-request-detail.entity'
import { NotificationStatusCode } from './entities/notification-status-code.entity'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { NotificationChannelCode } from './entities/notification-channel-code.entity'
import { NotificationEventTypeCode } from './entities/notification-event-type-code.entity'
import { NotificationController } from './notification.controller'
import { NotificationFrontendController } from './notification-frontend.controller'
import { NotificationService } from './notification.service'
import { NotificationRequestDetailService } from './notification-request-detail.service'
import { NotificationPubSubService } from './notification-pubsub.service'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { TemplatesModule } from '../templates/templates.module'
import { FeatureFlagModule } from '../feature-flag/feature-flag.module'
import { CstarModule } from '../../services/cstar/cstar.module'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationRequest,
      NotificationRequestDetail,
      NotificationStatusCode,
      NotificationChannelCode,
      NotificationEventTypeCode,
      Tenant,
    ]),
    TenantsModule,
    TemplatesModule,
    FeatureFlagModule,
    CstarModule,
  ],
  controllers: [NotificationController, NotificationFrontendController],
  providers: [
    NotificationService,
    NotificationRequestDetailService,
    NotificationPubSubService,
    NotifyFrontendRoleGuard,
  ],
  exports: [NotificationService, NotificationRequestDetailService, NotificationPubSubService],
})
export class NotificationModule {}
