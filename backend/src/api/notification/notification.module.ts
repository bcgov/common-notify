import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotificationRequest } from './entities/notification-request.entity'
import { NotificationDelivery } from './entities/notification-delivery.entity'
import { NotificationStatusCode } from './entities/notification-status-code.entity'
import { NotificationChannelCode } from './entities/notification-channel-code.entity'
import { NotificationEventTypeCode } from './entities/notification-event-type-code.entity'
import { NotificationController } from './notification.controller'
import { NotificationFrontendController } from './notification-frontend.controller'
import { NotificationService } from './notification.service'
import { NotificationDeliveryService } from './notification-delivery.service'
import { NotificationPubSubService } from './notification-pubsub.service'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { ClientTenantMappingModule } from '../admin/client-tenant-mappings/client-tenant-mapping.module'
import { TemplatesModule } from '../templates/templates.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationRequest,
      NotificationDelivery,
      NotificationStatusCode,
      NotificationChannelCode,
      NotificationEventTypeCode,
    ]),
    TenantsModule,
    ClientTenantMappingModule,
    TemplatesModule,
  ],
  controllers: [NotificationController, NotificationFrontendController],
  providers: [NotificationService, NotificationDeliveryService, NotificationPubSubService],
  exports: [NotificationService, NotificationDeliveryService, NotificationPubSubService],
})
export class NotificationModule {}
