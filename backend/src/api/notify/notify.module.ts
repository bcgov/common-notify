import { Module } from '@nestjs/common'
import { TenantsModule } from '../../admin/tenants/tenants.module'
import { ChesModule } from '../../ches/ches.module'
import { NotificationModule } from '../../notification/notification.module'
import { QueueModule } from '../../queue/queue.module'
import {
  NotifyController,
  NotifySimpleController,
  NotifyEventController,
  TemplatesController,
  ChesEmailController,
} from './notify.controller'
import { NotifyService } from './notify.service'

@Module({
  imports: [TenantsModule, ChesModule, NotificationModule, QueueModule],
  controllers: [
    NotifySimpleController,
    NotifyEventController,
    NotifyController,
    TemplatesController,
    ChesEmailController,
  ],
  providers: [NotifyService],
  exports: [NotifyService],
})
export class NotifyModule {}
