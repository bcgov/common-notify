import { Module } from '@nestjs/common';
import { GcNotifyController } from './gc-notify.controller';

/**
 * GC Notify core API module - notifications, templates (read), bulk.
 */
@Module({
  controllers: [GcNotifyController],
})
export class GcNotifyApiModule {}
