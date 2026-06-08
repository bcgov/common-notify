import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotificationRequest } from './entities/notification-request.entity'
import { NotificationStatusCode } from './entities/notification-status-code.entity'
import { ApiKey } from '../admin/api-keys/entities/api-key.entity'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { NotificationChannelCode } from './entities/notification-channel-code.entity'
import { NotificationEventTypeCode } from './entities/notification-event-type-code.entity'
import { NotificationController } from './notification.controller'
import { NotificationFrontendController } from './notification-frontend.controller'
import { NotificationService } from './notification.service'
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
      NotificationStatusCode,
      NotificationChannelCode,
      NotificationEventTypeCode,
      ApiKey,
      Tenant,
    ]),
    TenantsModule,
    TemplatesModule,
    FeatureFlagModule,
    CstarModule,
  ],
  controllers: [NotificationController, NotificationFrontendController],
  providers: [NotificationService, NotificationPubSubService, NotifyFrontendRoleGuard],
  exports: [NotificationService, NotificationPubSubService],
})
export class NotificationModule {}
