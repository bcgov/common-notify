import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Template } from './entities/template.entity'
import { TemplateVersion } from './entities/template-version.entity'

/**
 * Repository for template data access
 * Handles all database operations for templates
 */
@Injectable()
export class TemplatesRepository {
  constructor(
    @InjectRepository(Template)
    private readonly templateRepository: Repository<Template>,
    @InjectRepository(TemplateVersion)
    private readonly templateVersionRepository: Repository<TemplateVersion>,
  ) {}

  /**
   * Find a template by ID and tenant ID
   */
  async findById(tenantId: string, templateId: string): Promise<Template | null> {
    return this.templateRepository.findOne({
      where: { id: templateId, tenantId },
      relations: ['channel', 'engine'],
    })
  }

  /**
   * Find all active templates for a tenant
   */
  async findByTenantId(
    tenantId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<[Template[], number]> {
    return this.templateRepository.findAndCount({
      where: { tenantId, active: true },
      relations: ['channel', 'engine'],
      take: limit,
      skip: offset,
      order: { createdAt: 'DESC' },
    })
  }

  /**
   * Find a template by name and tenant ID
   */
  async findByName(tenantId: string, name: string): Promise<Template | null> {
    return this.templateRepository.findOne({
      where: { tenantId, name },
      relations: ['channel', 'engine'],
    })
  }

  /**
   * Create a new template
   */
  async create(template: Partial<Template>): Promise<Template> {
    const newTemplate = this.templateRepository.create(template)
    return this.templateRepository.save(newTemplate)
  }

  /**
   * Update a template
   */
  async update(template: Template): Promise<Template> {
    return this.templateRepository.save(template)
  }

  /**
   * Soft delete a template (mark as inactive)
   */
  async softDelete(templateId: string): Promise<void> {
    await this.templateRepository.update(templateId, { active: false })
  }

  /**
   * Find all versions of a template
   */
  async findVersions(
    templateId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<[TemplateVersion[], number]> {
    return this.templateVersionRepository.findAndCount({
      where: { templateId },
      relations: ['channel', 'engine'],
      take: limit,
      skip: offset,
      order: { version: 'DESC' },
    })
  }

  /**
   * Get the highest version number for a template
   */
  async getNextVersion(templateId: string): Promise<number> {
    const result = await this.templateVersionRepository.findOne({
      where: { templateId },
      order: { version: 'DESC' },
    })
    return (result?.version ?? 0) + 1
  }

  /**
   * Create a new template version record (for history)
   */
  async createVersion(version: Partial<TemplateVersion>): Promise<TemplateVersion> {
    const newVersion = this.templateVersionRepository.create(version)
    return this.templateVersionRepository.save(newVersion)
  }

  /**
   * Find a specific version by template ID and version number
   */
  async findVersion(templateId: string, version: number): Promise<TemplateVersion | null> {
    return this.templateVersionRepository.findOne({
      where: { templateId, version },
      relations: ['channel', 'engine'],
    })
  }
}
