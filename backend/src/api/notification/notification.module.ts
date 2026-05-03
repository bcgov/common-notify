import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotificationRequest } from './entities/notification-request.entity'
import { NotificationStatusCode } from './entities/notification-status-code.entity'
import { NotificationChannelCode } from './entities/notification-channel-code.entity'
import { NotificationEventTypeCode } from './entities/notification-event-type-code.entity'
import { NotificationController } from './notification.controller'
import { NotificationFrontendController } from './notification-frontend.controller'
import { NotificationService } from './notification.service'
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
  controllers: [NotificationController, NotificationFrontendController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
