import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
} from '@nestjs/common'
import MarkdownIt from 'markdown-it'
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

/**
 * Service for template business logic
 * Handles template CRUD operations, versioning, and rendering
 */
@Injectable()
export class TemplatesService {
  private readonly markdown: MarkdownIt

  constructor(
    private readonly templatesRepository: TemplatesRepository,
    @Inject(TEMPLATE_RENDERER_REGISTRY_TOKEN)
    private readonly rendererRegistry: ITemplateRendererRegistry,
    private readonly tenantsService: TenantsService,
  ) {
    // Initialize markdown-it with safe defaults
    this.markdown = new MarkdownIt({
      html: true,
      linkify: true,
      typographer: false,
    })
  }

  /**
   * List all active templates for a tenant
   * @param tenantId The tenant ID
   * @param page Page number (1-indexed)
   * @param limit Items per page (max 100)
   */
  async listTemplates(
    tenantId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
  ): Promise<PaginatedTemplateResponse> {
    // Validate pagination limits
    if (limit > 100) {
      throw new BadRequestException('Limit must not exceed 100 items per page')
    }
    if (limit < 1) {
      throw new BadRequestException('Limit must be at least 1')
    }
    if (page < 1) {
      throw new BadRequestException('Page must be at least 1')
    }

    // Convert page number to offset (1-indexed to 0-indexed)
    const offset = (page - 1) * limit
    const [templates, total] = await this.templatesRepository.findByTenantId(
      tenantId,
      limit,
      offset,
      search,
    )
    return {
      data: templates.map((t) => this.toResponseDto(t)),
      count: total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  /**
   * List all active templates for a tenant by external (CSTAR) ID
   * @param tenantExternalId The tenant external ID
   * @param page Page number (1-indexed)
   * @param limit Items per page (max 100)
   */
  async listTemplatesByExternalId(
    tenantExternalId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
  ): Promise<PaginatedTemplateResponse> {
    // Look up tenant by external ID and get internal ID
    const tenant = await this.tenantsService.findByExternalId(tenantExternalId)
    if (!tenant) {
      throw new NotFoundException(`Tenant with external ID '${tenantExternalId}' not found`)
    }

    // Use the internal tenant ID to list templates
    return this.listTemplates(tenant.id, page, limit, search)
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
    const bodyType = engineCode === TemplateEngine.MJML ? null : (createDto.bodyType ?? 'html')

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
      template.bodyType = updateDto.bodyType ?? template.bodyType ?? 'html'
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
   * @param bodyType Optional override for body content type (text, markdown, html)
   * @returns Object with rendered subject, body, and bodyType
   */
  public async renderTemplateContent(
    template: Template,
    personalisation: Record<string, any> = {},
    bodyType?: 'text' | 'markdown' | 'html',
  ): Promise<{ subject?: string; body: string; bodyType: 'text' | 'markdown' | 'html' }> {
    // Convert all personalisation values to strings for template rendering
    const stringPersonalisation: Record<string, string> = {}
    for (const [key, value] of Object.entries(personalisation)) {
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
    const effectiveBodyType = bodyType ?? template.bodyType ?? 'html'

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

  /**
   * Render markdown to HTML
   * Converts markdown-formatted text to HTML
   * @param markdown The markdown text to convert
   * @returns HTML-formatted text
   */
  private renderMarkdown(markdown: string): string {
    try {
      return this.markdown.render(markdown)
    } catch (error) {
      throw new BadRequestException(`Markdown rendering error: ${(error as Error).message}`)
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
