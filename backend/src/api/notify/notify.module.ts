import { Module } from '@nestjs/common'
import { TenantsModule } from '../../admin/tenants/tenants.module'
import {
  NotifyController,
  NotifySimpleController,
  NotifyEventController,
  TemplatesController,
  ChesEmailController,
} from './notify.controller'
import { NotifyService } from './notify.service'

@Module({
  imports: [TenantsModule],
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
