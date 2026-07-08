import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
} from '@nestjs/common'
import { Template } from './entities/template.entity'
import { TemplateEngine } from '../../enum/template-engine.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplatesRepository } from './templates.repository'
import { CreateTemplateDto } from './schemas/create-template.dto'
import { UpdateTemplateDto } from './schemas/update-template.dto'
import { PreviewTemplateDto } from './schemas/preview-template.dto'
import { TemplateResponseDto } from './schemas/template-response.dto'
import { PaginatedTemplateResponse } from './schemas/paginated-template-response'
import { TEMPLATE_RENDERER_REGISTRY_TOKEN } from '../../services/rendering/tokens'
import { ITemplateRendererRegistry } from '../../adapters/interfaces'
import type { TemplateDefinition } from '../../adapters/interfaces'
import { TenantsService } from '../admin/tenants/tenants.service'
import type { ParsedListQuery } from '../../common/query/list-query.types'
import { extractLegacyGcNotifyPlaceholders } from '../../services/rendering/engines/legacy-gc-notify-placeholder.parser'

/**
 * Service for template business logic
 * Handles template CRUD operations, versioning, and rendering
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly templatesRepository: TemplatesRepository,
    @Inject(TEMPLATE_RENDERER_REGISTRY_TOKEN)
    private readonly rendererRegistry: ITemplateRendererRegistry,
    private readonly tenantsService: TenantsService,
  ) {}

  /**
   * List all active templates for a tenant
   * @param tenantId The tenant ID
   * @param parsedQuery Parsed list query with pagination, sort, and filter
   */
  async listTemplates(
    tenantId: string,
    parsedQuery: ParsedListQuery,
  ): Promise<PaginatedTemplateResponse> {
    // Extract pagination info from parsed query
    const page = parsedQuery.page
    const limit = parsedQuery.limit

    // Query templates using the parsed query (with filters and sorts applied)
    const [templates, total] = await this.templatesRepository.findWithQuery(tenantId, parsedQuery)
    return {
      data: templates.map((t) => this.toResponseDto(t)),
      count: total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  /**
   * Get a specific template
   */
  async getTemplate(tenantId: string, templateId: string): Promise<TemplateResponseDto> {
    const template = await this.templatesRepository.findById(tenantId, templateId)
    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`)
    }
    return this.toResponseDto(template)
  }

  /**
   * Create a new template
   * @param tenantId The tenant ID
   * @param createDto Template creation data
   * @param userId User creating the template (for audit trail)
   */
  async createTemplate(
    tenantId: string,
    createDto: CreateTemplateDto,
    userId: string = 'system',
  ): Promise<TemplateResponseDto> {
    // Validate channel-specific required fields
    if (createDto.channelCode === NotificationChannel.EMAIL && !createDto.subject) {
      throw new BadRequestException('Email templates require a subject')
    }

    // Check if template name already exists for this tenant
    const existing = await this.templatesRepository.findByName(tenantId, createDto.name)
    if (existing) {
      throw new ConflictException(`Template name "${createDto.name}" already exists`)
    }

    const engineCode = createDto.engineCode || TemplateEngine.HANDLEBARS
    const bodyType = engineCode === TemplateEngine.MJML ? null : 'markdown'

    const template = await this.templatesRepository.create({
      tenantId,
      name: createDto.name,
      description: createDto.description,
      channelCode: createDto.channelCode,
      subject: createDto.subject,
      body: createDto.body,
      engineCode,
      bodyType,
      version: 1,
      active: true,
      createdBy: userId,
      updatedBy: userId,
    })

    // Create a version record
    await this.templatesRepository.createVersion({
      templateId: template.id,
      version: 1,
      name: template.name,
      description: template.description,
      channelCode: template.channelCode,
      subject: template.subject,
      body: template.body,
      engineCode: template.engineCode,
      bodyType: template.bodyType,
      createdBy: userId,
    })

    return this.toResponseDto(template)
  }

  /**
   * Update a template (creates a new version)
   * @param tenantId The tenant ID
   * @param templateId The template ID
   * @param updateDto Template update data
   * @param userId User updating the template (for audit trail)
   */
  async updateTemplate(
    tenantId: string,
    templateId: string,
    updateDto: UpdateTemplateDto,
    userId: string = 'system',
  ): Promise<TemplateResponseDto> {
    const template = await this.templatesRepository.findById(tenantId, templateId)
    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`)
    }

    // Validate channel-specific required fields if channel is being changed
    const channelCode = updateDto.channelCode || template.channelCode
    if (channelCode === NotificationChannel.EMAIL) {
      const subject = updateDto.subject || template.subject
      if (!subject) {
        throw new BadRequestException('Email templates require a subject')
      }
    }

    // Check if name is being changed to an existing template
    if (updateDto.name && updateDto.name !== template.name) {
      const existing = await this.templatesRepository.findByName(tenantId, updateDto.name)
      if (existing) {
        throw new ConflictException(`Template name "${updateDto.name}" already exists`)
      }
    }

    // Update the template
    const nextEngineCode = updateDto.engineCode || template.engineCode
    template.name = updateDto.name || template.name
    template.description = updateDto.description ?? template.description
    template.channelCode = updateDto.channelCode || template.channelCode
    template.subject = updateDto.subject ?? template.subject
    template.body = updateDto.body || template.body
    template.engineCode = nextEngineCode
    if (nextEngineCode === TemplateEngine.MJML) {
      template.bodyType = null
    } else {
      template.bodyType = updateDto.bodyType ?? template.bodyType ?? 'markdown'
    }
    template.updatedBy = userId

    const updated = await this.templatesRepository.update(template)

    // Version record is automatically created by database trigger
    // This ensures version history is maintained even for direct SQL updates/datafixes

    return this.toResponseDto(updated)
  }

  /**
   * Delete a template (soft delete)
   */
  async deleteTemplate(tenantId: string, templateId: string): Promise<void> {
    const template = await this.templatesRepository.findById(tenantId, templateId)
    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`)
    }

    await this.templatesRepository.softDelete(templateId)
  }

  /**
   * Preview a template with sample data
   * Renders the template without storing anything
   */
  async previewTemplate(
    tenantId: string,
    templateId: string,
    previewDto: PreviewTemplateDto,
  ): Promise<any> {
    const template = await this.templatesRepository.findById(tenantId, templateId)
    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`)
    }

    // Use the same rendering logic as delivery workers to avoid code duplication
    const rendered = await this.renderTemplateContent(template, previewDto.params || {})

    return {
      templateId: template.id,
      channelCode: template.channelCode,
      subject: rendered.subject,
      body: rendered.body,
      bodyType: rendered.bodyType,
    }
  }

  /**
   * Render template content (subject and/or body) with personalisation data
   * Used by delivery workers to render templates before sending
   * Returns raw body with bodyType flag - adapter will handle format conversion
   * @param template The template to render
   * @param personalisation The data to use for rendering (e.g., request.params)
   * @param bodyType Optional override for body content type
   * @returns Object with rendered subject, body, and bodyType
   */
  public async renderTemplateContent(
    template: Template,
    personalisation: Record<string, any> = {},
    bodyType?: 'markdown',
  ): Promise<{ subject?: string; body: string; bodyType: 'markdown' | 'html' }> {
    const normalizedPersonalisation = personalisation ?? {}

    this.validateLegacyGcNotifyPersonalisation(template, normalizedPersonalisation)

    // Convert all personalisation values to strings for template rendering
    const stringPersonalisation: Record<string, string> = {}
    for (const [key, value] of Object.entries(normalizedPersonalisation)) {
      stringPersonalisation[key] = value !== null && value !== undefined ? String(value) : ''
    }

    // Get the renderer for this template's engine
    const engineName = this.mapEngineToRendererName(template.engineCode as TemplateEngine)
    const renderer = this.rendererRegistry.getRenderer(engineName)

    if (!renderer) {
      throw new BadRequestException(
        `Template renderer not found for engine: ${template.engineCode}`,
      )
    }

    // Create template definition for the renderer
    const templateDef: TemplateDefinition = {
      id: template.id,
      type: this.mapChannelToType(template.channelCode),
      name: template.name,
      description: template.description,
      subject: template.subject,
      body: template.body,
      active: template.active,
      engine: engineName,
    }

    // Render the template
    const renderContext = {
      template: templateDef,
      personalisation: stringPersonalisation,
    }

    const rendered = await renderer.renderEmail(renderContext)

    // Use provided bodyType or fall back to template's bodyType setting
    const effectiveBodyType =
      bodyType ??
      template.bodyType ??
      (template.engineCode === TemplateEngine.MJML ? 'html' : 'markdown')

    // Return rendered content with bodyType flag for adapter to process
    return {
      subject: rendered.subject,
      body: rendered.body,
      bodyType: effectiveBodyType,
    }
  }

  /**
   * Map TemplateEngine enum to renderer registry engine name
   */
  private mapEngineToRendererName(engine: TemplateEngine): string {
    switch (engine) {
      case TemplateEngine.LEGACY_GC_NOTIFY:
        return 'legacy_gc_notify'
      case TemplateEngine.HANDLEBARS:
        return 'handlebars'
      case TemplateEngine.MUSTACHE:
        return 'mustache'
      case TemplateEngine.MJML:
        return 'mjml'
      default:
        return 'handlebars' // default fallback
    }
  }

  /**
   * Map NotificationChannel to TemplateDefinition type
   */
  private mapChannelToType(channelCode: string): 'email' | 'sms' {
    switch (channelCode) {
      case NotificationChannel.EMAIL:
        return 'email'
      case NotificationChannel.SMS:
        return 'sms'
      default:
        return 'email' // default fallback
    }
  }

  private validateLegacyGcNotifyPersonalisation(
    template: Template,
    personalisation: Record<string, any>,
  ): void {
    if (template.engineCode !== TemplateEngine.LEGACY_GC_NOTIFY) {
      return
    }

    const requiredKeys = [
      ...new Set([
        ...extractLegacyGcNotifyPlaceholders(template.body),
        ...(template.channelCode === NotificationChannel.EMAIL
          ? extractLegacyGcNotifyPlaceholders(template.subject)
          : []),
      ]),
    ]

    const missingKeys = requiredKeys.filter(
      (key) => !Object.prototype.hasOwnProperty.call(personalisation, key),
    )

    if (missingKeys.length > 0) {
      throw new BadRequestException(
        `Missing personalisation for template ID ${template.id}: ${missingKeys.join(', ')}`,
      )
    }
  }

  /**
   * Convert Template entity to response DTO
   */
  private toResponseDto(template: Template): any {
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      channelCode: template.channelCode,
      subject: template.subject,
      body: template.body,
      bodyType: template.bodyType,
      engineCode: template.engineCode,
      version: template.version,
      active: template.active,
      createdBy: template.createdBy,
      createdAt: template.createdAt,
      updatedBy: template.updatedBy,
      updatedAt: template.updatedAt,
    }
  }
}
