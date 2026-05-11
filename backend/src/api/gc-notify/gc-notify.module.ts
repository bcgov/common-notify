import { DynamicModule, Module } from '@nestjs/common'
import { GcNotifyApiClient } from './gc-notify-api.client'
import { GcNotifyController } from './gc-notify.controller'
import { TenantsModule } from '../admin/tenants/tenants.module'

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
      imports: [TenantsModule],
      controllers: [GcNotifyController],
      providers: [GcNotifyApiClient],
      exports: [GcNotifyApiClient],
    }
  }
}
