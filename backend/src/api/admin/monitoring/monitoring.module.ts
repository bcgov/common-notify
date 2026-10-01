import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Tenant } from '../tenants/entities/tenant.entity'
import { NotificationRequestDetail } from '../../notification/entities/notification-request-detail.entity'
import { QueueModule } from '../../../queue/queue.module'
import { NotifyAdminGuard } from '../../../common/guards/notify-admin.guard'
import { MonitoringController } from './monitoring.controller'
import { MonitoringService } from './monitoring.service'
import { MonitoringEventsService } from './monitoring-events.service'

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, NotificationRequestDetail]), QueueModule],
  controllers: [MonitoringController],
  providers: [MonitoringService, MonitoringEventsService, NotifyAdminGuard],
})
export class MonitoringModule {}
