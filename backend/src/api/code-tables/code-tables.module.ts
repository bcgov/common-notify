import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotificationStatusCode } from '../notification/entities/notification-status-code.entity'
import { NotificationChannelCode } from '../notification/entities/notification-channel-code.entity'
import { NotificationEventTypeCode } from '../notification/entities/notification-event-type-code.entity'
import { FeatureFlagCode } from '../feature-flag/entities/feature-flag-code.entity'
import { CodeTablesService } from './code-tables.service'
import { CodeTablesController } from './code-tables.controller'
import { CodeTablesFrontendController } from './code-tables-frontend.controller'

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationStatusCode,
      NotificationChannelCode,
      NotificationEventTypeCode,
      FeatureFlagCode,
    ]),
  ],
  controllers: [CodeTablesController, CodeTablesFrontendController],
  providers: [CodeTablesService],
  exports: [CodeTablesService],
})
export class CodeTablesModule {}
