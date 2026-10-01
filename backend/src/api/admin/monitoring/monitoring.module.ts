import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Tenant } from '../tenants/entities/tenant.entity'
import { QueueModule } from '../../../queue/queue.module'
import { NotifyAdminGuard } from '../../../common/guards/notify-admin.guard'
import { MonitoringController } from './monitoring.controller'
import { MonitoringService } from './monitoring.service'

@Module({
  imports: [TypeOrmModule.forFeature([Tenant]), QueueModule],
  controllers: [MonitoringController],
  providers: [MonitoringService, NotifyAdminGuard],
})
export class MonitoringModule {}
