import { Module } from '@nestjs/common'
import {
  NotifyController,
  NotifySimpleController,
  NotifyEventController,
  TemplatesController,
  ChesEmailController,
} from './notify.controller'
import { NotifyService } from './notify.service'

@Module({
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
