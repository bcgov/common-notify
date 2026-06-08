import { Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ApiKey } from '../admin/api-keys/entities/api-key.entity'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { ApiKeyModule } from '../admin/api-keys/api-key.module'
import { ChesModule } from '../../ches/ches.module'
import { TemplatesModule } from '../templates/templates.module'
import { FeatureFlagModule } from '../feature-flag/feature-flag.module'
import { CstarModule } from '../../services/cstar/cstar.module'
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
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { NotifyServiceGuard } from '../../common/guards/notify-service.guard'

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey, Tenant]),
    TenantsModule,
    ApiKeyModule,
    ChesModule,
    NotificationModule,
    RenderingModule,
    FeatureFlagModule,
    CstarModule,
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
  providers: [NotifyService, NotifyFrontendRoleGuard, NotifyServiceGuard],
  exports: [NotifyService, RenderingModule],
})
export class NotifyModule {}
