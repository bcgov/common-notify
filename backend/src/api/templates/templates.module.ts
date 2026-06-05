import { Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { ClientTenantMappingModule } from '../admin/client-tenant-mappings/client-tenant-mapping.module'
import { TemplatesController } from './templates.controller'
import { TemplatesFrontendController } from './templates-frontend.controller'
import { TemplatesService } from './templates.service'
import { TemplatesRepository } from './templates.repository'
import { Template } from './entities/template.entity'
import { TemplateVersion } from './entities/template-version.entity'
import { TemplateEngineCode } from './entities/template-engine-code.entity'
import { RenderingModule } from '../../services/rendering/rendering.module'
import { NotifyModule } from '../notify/notify.module'
import { CstarModule } from '../../services/cstar/cstar.module'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'

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
    ClientTenantMappingModule,
    TypeOrmModule.forFeature([Template, TemplateVersion, TemplateEngineCode]),
    RenderingModule,
    CstarModule,
    forwardRef(() => NotifyModule),
  ],
  controllers: [TemplatesController, TemplatesFrontendController],
  providers: [TemplatesService, TemplatesRepository, NotifyFrontendRoleGuard],
  exports: [TemplatesService, TemplatesRepository],
})
export class TemplatesModule {}
