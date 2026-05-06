import { Module, forwardRef } from '@nestjs/common'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { ChesModule } from '../../ches/ches.module'
import { TemplatesModule } from '../templates/templates.module'
import {
  NotifyController,
  NotifySimpleController,
  NotifyEventController,
  ChesEmailController,
} from './notify.controller'
import { NotifyService } from './notify.service'
import { NotificationModule } from '../notification/notification.module'
import { RenderingModule } from '../../services/rendering/rendering.module'
import { QueueModule } from '../../queue/queue.module'

@Module({
  imports: [
    TenantsModule,
    ChesModule,
    NotificationModule,
    RenderingModule,
    forwardRef(() => TemplatesModule),
    forwardRef(() => QueueModule),
  ],
  controllers: [
    NotifySimpleController,
    NotifyEventController,
    NotifyController,
    ChesEmailController,
  ],
  providers: [NotifyService],
  exports: [NotifyService, RenderingModule],
})
export class NotifyModule {}
