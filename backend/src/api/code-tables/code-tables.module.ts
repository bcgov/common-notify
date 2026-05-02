import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotificationStatusCode } from '../notification/entities/notification-status-code.entity'
import { NotificationChannelCode } from '../notification/entities/notification-channel-code.entity'
import { NotificationEventTypeCode } from '../notification/entities/notification-event-type-code.entity'
import { CodeTablesService } from './code-tables.service'
import { CodeTablesController } from './code-tables.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationStatusCode,
      NotificationChannelCode,
      NotificationEventTypeCode,
    ]),
  ],
  controllers: [CodeTablesController],
  providers: [CodeTablesService],
  exports: [CodeTablesService],
})
export class CodeTablesModule {}
