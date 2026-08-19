import { DynamicModule, Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { GcNotifyApiClient } from './gc-notify-api.client'
import { GcNotifyController } from './gc-notify.controller'
import { GcNotifyPassthroughController } from './gc-notify-passthrough.controller'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { ApiKeysModule } from '../api-keys/api-keys.module'
import { FeatureFlagModule } from '../feature-flag/feature-flag.module'
import { TemplatesModule } from '../templates/templates.module'
import { NotificationModule } from '../notification/notification.module'
import { QueueModule } from '../../queue/queue.module'
import { NotifyConfiguration } from '../notification/entities/configuration.entity'
import { GcNotifyServiceGuard } from '../../common/guards/gc-notify-service.guard'
import { ApiKeyGuard } from '../../common/guards/api-key.guard'
import { GcNotifyRoutingService } from './gc-notify-routing.service'
import { GcNotifyInternalExecutionService } from './gc-notify-internal-execution.service'
import { SafelistModule } from '../safelist/safelist.module'

/** Reserved for future options. */
export type GcNotifyModuleOptions = Record<string, never>

/**
 * GC Notify module - provides GcNotifyApiClient and registers the GC Notify passthrough controller.
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
        SafelistModule,
        TypeOrmModule.forFeature([NotifyConfiguration]),
        forwardRef(() => QueueModule),
      ],
      controllers: [GcNotifyController, GcNotifyPassthroughController],
      providers: [
        GcNotifyApiClient,
        GcNotifyServiceGuard,
        ApiKeyGuard,
        GcNotifyRoutingService,
        GcNotifyInternalExecutionService,
      ],
      exports: [GcNotifyApiClient],
    }
  }
}
