import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotificationRequest } from '../../notification/entities/notification-request.entity'
import { NotificationRequestDetail } from '../../notification/entities/notification-request-detail.entity'
import { NotifyAdminGuard } from '../../../common/guards/notify-admin.guard'
import { AdminNotificationsController } from './admin-notifications.controller'
import { AdminNotificationsService } from './admin-notifications.service'

@Module({
  imports: [TypeOrmModule.forFeature([NotificationRequest, NotificationRequestDetail])],
  controllers: [AdminNotificationsController],
  providers: [AdminNotificationsService, NotifyAdminGuard],
})
export class AdminNotificationsModule {}
