import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotificationRequest } from './entities/notification-request.entity'
import { NotificationStatusCode } from './entities/notification-status-code.entity'
import { NotificationChannelCode } from './entities/notification-channel-code.entity'
import { NotificationEventTypeCode } from './entities/notification-event-type-code.entity'
import { NotificationController } from './notification.controller'
import { NotificationService } from './notification.service'
import { NotificationPubSubService } from './notification-pubsub.service'
import { TenantsModule } from '../admin/tenants/tenants.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationRequest,
      NotificationStatusCode,
      NotificationChannelCode,
      NotificationEventTypeCode,
    ]),
    TenantsModule,
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationPubSubService],
  exports: [NotificationService, NotificationPubSubService],
})
export class NotificationModule {}
