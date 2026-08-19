import { Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { ApiKeysModule } from '../api-keys/api-keys.module'
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
import { WebhookModule } from '../webhook/webhook.module'
import { MimeTypeCode } from '../notification/entities/mime-type-code.entity'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { AttachmentValidationService } from './services/attachment-validation.service'
import { AttachmentProcessingService } from './services/attachment-processing.service'
import { AttachmentResolverService } from './services/attachment-resolver.service'
import { LimitAlertNotificationService } from './services/limit-alert-notification.service'
import { SmsSegmentService } from './services/sms-segment.service'
import { AttachmentModule } from '../attachment/attachment.module'
import { SafelistModule } from '../safelist/safelist.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, MimeTypeCode, NotifyConfiguration]),
    TenantsModule,
    ChesModule,
    NotificationModule,
    RenderingModule,
    FeatureFlagModule,
    CstarModule,
    WebhookModule,
    ApiKeysModule,
    AttachmentModule,
    SafelistModule,
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
  providers: [
    NotifyService,
    NotifyFrontendRoleGuard,
    NotifyServiceGuard,
    AttachmentValidationService,
    AttachmentProcessingService,
    AttachmentResolverService,
    LimitAlertNotificationService,
    SmsSegmentService,
  ],
  exports: [
    NotifyService,
    RenderingModule,
    AttachmentValidationService,
    AttachmentProcessingService,
    AttachmentResolverService,
    SmsSegmentService,
  ],
})
export class NotifyModule {}
