import { Module, forwardRef } from '@nestjs/common'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { ClientTenantMappingModule } from '../admin/client-tenant-mappings/client-tenant-mapping.module'
import { ChesModule } from '../../ches/ches.module'
import { TemplatesModule } from '../templates/templates.module'
import {
  NotifyController,
  NotifySimpleController,
  NotifySimpleFrontendController,
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
    ClientTenantMappingModule,
    ChesModule,
    NotificationModule,
    RenderingModule,
    forwardRef(() => TemplatesModule),
    forwardRef(() => QueueModule),
  ],
  controllers: [
    NotifySimpleController,
    NotifySimpleFrontendController,
    NotifyEventController,
    NotifyController,
    ChesEmailController,
  ],
  providers: [NotifyService],
  exports: [NotifyService, RenderingModule],
})
export class NotifyModule {}
