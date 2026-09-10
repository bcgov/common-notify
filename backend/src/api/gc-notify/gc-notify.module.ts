import { DynamicModule, Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { GcNotifyApiClient } from './gc-notify-api.client'
import { GcNotifyController } from './gc-notify.controller'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { ApiKeysModule } from '../api-keys/api-keys.module'
import { FeatureFlagModule } from '../feature-flag/feature-flag.module'
import { TemplatesModule } from '../templates/templates.module'
import { NotificationModule } from '../notification/notification.module'
import { QueueModule } from '../../queue/queue.module'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { MimeTypeCode } from '../notification/entities/mime-type-code.entity'
import { GcNotifyServiceGuard } from '../../common/guards/gc-notify-service.guard'
import { GcNotifyRoutingService } from './gc-notify-routing.service'
import { GcNotifyInternalExecutionService } from './gc-notify-internal-execution.service'
import { GcNotifyBulkValidationService } from './gc-notify-bulk-validation.service'
import { PhoneNumberService } from '../notify/services/phone-number.service'
import { AttachmentModule } from '../attachment/attachment.module'
import { AttachmentValidationService } from '../notify/services/attachment-validation.service'
import { AttachmentProcessingService } from '../notify/services/attachment-processing.service'
import { SafelistModule } from '../safelist/safelist.module'

/** Reserved for future options. */
export type GcNotifyModuleOptions = Record<string, never>

/**
 * GC Notify module - provides GcNotifyApiClient and registers the GC Notify controller.
 */
@Module({})
export class GcNotifyModule {
  static forRoot(_options: GcNotifyModuleOptions = {}): DynamicModule {
    return {
      module: GcNotifyModule,
      global: true,
      imports: [
        TenantsModule,
        ApiKeysModule,
        FeatureFlagModule,
        TemplatesModule,
        NotificationModule,
        AttachmentModule,
        TypeOrmModule.forFeature([NotifyConfiguration, MimeTypeCode]),
        SafelistModule,
        forwardRef(() => QueueModule),
      ],
      controllers: [GcNotifyController],
      providers: [
        GcNotifyApiClient,
        GcNotifyServiceGuard,
        GcNotifyRoutingService,
        GcNotifyInternalExecutionService,
        GcNotifyBulkValidationService,
        PhoneNumberService,
        AttachmentValidationService,
        AttachmentProcessingService,
      ],
      exports: [GcNotifyApiClient],
    }
  }
}
