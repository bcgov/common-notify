import { Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { TemplatesController } from './templates.controller'
import { TemplatesFrontendController } from './templates-frontend.controller'
import { TemplatesService } from './templates.service'
import { TemplatesRepository } from './templates.repository'
import { Template } from './entities/template.entity'
import { TemplateVersion } from './entities/template-version.entity'
import { TemplateEngineCode } from './entities/template-engine-code.entity'
import { EventChannelSetting } from '../events/entities/event-channel-setting.entity'
import { RenderingModule } from '../../services/rendering/rendering.module'
import { NotifyModule } from '../notify/notify.module'
import { CstarModule } from '../../services/cstar/cstar.module'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { ApiKeysModule } from '../api-keys/api-keys.module'
import { TenantSettingsModule } from '../tenant-settings/tenant-settings.module'
import { EmailLogoModule } from '../email-logo/email-logo.module'
import { EmailTemplateLayoutService } from './email-template-layout.service'

/**
 * Feature Module for Templates
 * Contains all templates-related functionality:
 * - REST endpoints (controller)
 * - Business logic (service)
 * - Data access (repository)
 * - Database entities
 */
@Module({
  imports: [
    TenantsModule,
    // EventChannelSetting, not EventsModule: that module already imports this one, and a
    // template only needs to know which events still render with it before it is deleted.
    TypeOrmModule.forFeature([
      Template,
      TemplateVersion,
      TemplateEngineCode,
      Tenant,
      EventChannelSetting,
    ]),
    RenderingModule,
    CstarModule,
    ApiKeysModule,
    TenantSettingsModule,
    EmailLogoModule,
    forwardRef(() => NotifyModule),
  ],
  controllers: [TemplatesController, TemplatesFrontendController],
  providers: [
    TemplatesService,
    TemplatesRepository,
    EmailTemplateLayoutService,
    NotifyFrontendRoleGuard,
  ],
  exports: [TemplatesService, TemplatesRepository],
})
export class TemplatesModule {}
