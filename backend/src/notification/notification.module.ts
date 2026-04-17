import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotificationRequest } from './entities/notification-request.entity'
import { NotificationStatusCode } from './entities/notification-status-code.entity'
import { NotificationController } from './notification.controller'
import { NotificationService } from './notification.service'
import { TenantsModule } from '../admin/tenants/tenants.module'

@Module({
  imports: [TypeOrmModule.forFeature([NotificationRequest, NotificationStatusCode]), TenantsModule],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
