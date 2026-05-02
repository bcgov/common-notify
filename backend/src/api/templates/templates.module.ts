import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenantsModule } from '../admin/tenants/tenants.module'
import { TemplatesController } from './templates.controller'
import { TemplatesService } from './templates.service'
import { TemplatesRepository } from './templates.repository'
import { Template } from './entities/template.entity'
import { TemplateVersion } from './entities/template-version.entity'
import { TemplateEngineCode } from './entities/template-engine-code.entity'

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
    TypeOrmModule.forFeature([Template, TemplateVersion, TemplateEngineCode]),
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService, TemplatesRepository],
  exports: [TemplatesService, TemplatesRepository],
})
export class TemplatesModule {}
