import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Template } from './entities/template.entity'
import { TemplateVersion } from './entities/template-version.entity'
import { applyParsedListQueryToQueryBuilder } from '../../common/query/typeorm-list-query.util'
import type { ParsedListQuery, QueryableFieldsConfig } from '../../common/query/list-query.types'

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
   * Find all active templates for a tenant with advanced query support
   * Supports sorting, filtering, and pagination via ParsedListQuery
   */
  async findWithQuery(
    tenantId: string,
    parsedQuery: ParsedListQuery,
    search?: string,
  ): Promise<[Template[], number]> {
    // Define queryable fields configuration for templates
    const templateQueryConfig: QueryableFieldsConfig = {
      sortableFields: {
        name: 'template.name',
        createdAt: 'template.createdAt',
        updatedAt: 'template.updatedAt',
        channelCode: 'template.channelCode',
      },
      filterableFields: {
        name: {
          column: 'template.name',
          valueType: 'string',
          operators: ['eq', 'like'],
        },
        body: {
          column: 'template.body',
          valueType: 'string',
          operators: ['like'],
        },
        channelCode: {
          column: 'template.channelCode',
          valueType: 'string',
          operators: ['eq', 'in'],
        },
        createdAt: {
          column: 'template.createdAt',
          valueType: 'date',
          operators: ['gte', 'lte'],
        },
      },
      defaultSort: [{ field: 'updatedAt', direction: 'DESC' }],
    }

    // Build query with filters and sorts applied
    const queryBuilder = this.templateRepository
      .createQueryBuilder('template')
      .leftJoinAndSelect('template.channel', 'channel')
      .leftJoinAndSelect('template.engine', 'engine')
      .where('template.tenantId = :tenantId', { tenantId })
      .andWhere('template.active = :active', { active: true })

    // Case-insensitive search across template title (name) and description.
    // Applied as an OR group since the parsed-query filter mechanism only supports AND.
    if (search) {
      const escaped = search.replace(/[\\%_]/g, '\\$&')
      queryBuilder.andWhere(
        `(template.name ILIKE :search ESCAPE '\\' OR template.description ILIKE :search ESCAPE '\\')`,
        { search: `%${escaped}%` },
      )
    }

    // Apply parsed query (filters, sorts, pagination)
    applyParsedListQueryToQueryBuilder(queryBuilder, parsedQuery, templateQueryConfig)

    return queryBuilder.getManyAndCount()
  }

  /**
   * Find all active templates for a tenant
   * @deprecated Use findWithQuery() instead, which supports advanced filtering and sorting
   */
  async findByTenantId(
    tenantId: string,
    limit: number = 20,
    offset: number = 0,
    search?: string,
  ): Promise<[Template[], number]> {
    // This method is deprecated but kept for backward compatibility
    // For search, we need to apply OR logic, which the builder doesn't support natively
    // Fall back to the old method for backward compatibility
    const queryBuilder = this.templateRepository
      .createQueryBuilder('template')
      .leftJoinAndSelect('template.channel', 'channel')
      .leftJoinAndSelect('template.engine', 'engine')
      .where('template.tenantId = :tenantId', { tenantId })
      .andWhere('template.active = :active', { active: true })

    if (search) {
      const sanitizedSearch = search.replace(/[%_\\]/g, '\\$&')
      queryBuilder.andWhere(`(template.name ILIKE :search OR template.body ILIKE :search)`, {
        search: `%${sanitizedSearch}%`,
      })
    }

    queryBuilder.orderBy('template.updatedAt', 'DESC').take(limit).skip(offset)

    return queryBuilder.getManyAndCount()
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
    await this.templateRepository.update(templateId, {
      active: false,
      deletedAt: new Date(),
    })
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
