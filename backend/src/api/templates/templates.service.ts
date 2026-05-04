import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import * as Handlebars from 'handlebars'
import * as Mustache from 'mustache'
import * as EJS from 'ejs'
import MarkdownIt from 'markdown-it'
import { Template } from './entities/template.entity'
import { TemplateEngine } from '../../enum/template-engine.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplatesRepository } from './templates.repository'
import { CreateTemplateDto } from './schemas/create-template.dto'
import { UpdateTemplateDto } from './schemas/update-template.dto'
import { PreviewTemplateDto } from './schemas/preview-template.dto'
import { TemplateResponseDto } from './schemas/template-response.dto'

/**
 * Service for template business logic
 * Handles template CRUD operations, versioning, and rendering
 */
@Injectable()
export class TemplatesService {
  private readonly markdown: MarkdownIt

  constructor(private readonly templatesRepository: TemplatesRepository) {
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
  ): Promise<TemplateResponseDto[]> {
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
    const [templates] = await this.templatesRepository.findByTenantId(tenantId, limit, offset)
    return templates.map((t) => this.toResponseDto(t))
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
      throw new BadRequestException(`Template name "${createDto.name}" already exists`)
    }

    const template = await this.templatesRepository.create({
      tenantId,
      name: createDto.name,
      description: createDto.description,
      channelCode: createDto.channelCode,
      subject: createDto.subject,
      body: createDto.body,
      engineCode: createDto.engineCode || TemplateEngine.HANDLEBARS,
      renderAsMarkdown: createDto.renderAsMarkdown || false,
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
      renderAsMarkdown: template.renderAsMarkdown,
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
        throw new BadRequestException(`Template name "${updateDto.name}" already exists`)
      }
    }

    // Update the template
    template.name = updateDto.name || template.name
    template.description = updateDto.description ?? template.description
    template.channelCode = updateDto.channelCode || template.channelCode
    template.subject = updateDto.subject ?? template.subject
    template.body = updateDto.body || template.body
    template.engineCode = updateDto.engineCode || template.engineCode
    template.renderAsMarkdown = updateDto.renderAsMarkdown ?? template.renderAsMarkdown
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
    const rendered = this.renderTemplateContent(template, previewDto.personalisation || {})

    return {
      templateId: template.id,
      channelCode: template.channelCode,
      subject: rendered.subject,
      body: rendered.body,
    }
  }

  /**
   * Render template content (subject and/or body) with personalisation data
   * Used by delivery workers to render templates before sending
   * @param template The template to render
   * @param personalisation The data to use for rendering (e.g., request.params)
   * @returns Object with rendered subject and body
   */
  public renderTemplateContent(
    template: Template,
    personalisation: Record<string, any> = {},
  ): { subject?: string; body: string } {
    const subject = template.subject
      ? this.renderText(template.subject, personalisation, template.engineCode as TemplateEngine)
      : undefined

    let body = this.renderText(
      template.body,
      personalisation,
      template.engineCode as TemplateEngine,
    )

    // Apply markdown conversion to body only if enabled
    // Note: Subject is never rendered as markdown (email subjects should be plain text)
    if (template.renderAsMarkdown) {
      body = this.renderMarkdown(body)
    }

    return {
      subject,
      body,
    }
  }

  /**
   * Render a template with the specified engine
   * Routes to the appropriate rendering method based on template engine type
   */
  private async renderTemplate(
    template: Template,
    personalisation: Record<string, any>,
  ): Promise<string> {
    // Delegate to engine-specific rendering method
    switch (template.engineCode) {
      case TemplateEngine.LEGACY_GC_NOTIFY:
        return this.renderLegacyGcNotify(template.body, personalisation)
      case TemplateEngine.HANDLEBARS:
        return this.renderHandlebars(template.body, personalisation)
      case TemplateEngine.MUSTACHE:
        return this.renderMustache(template.body, personalisation)
      case TemplateEngine.EJS:
        return this.renderEjs(template.body, personalisation)
      default:
        throw new BadRequestException(`Unknown template engine: ${template.engineCode}`)
    }
  }

  /**
   * Render text with the specified engine
   */
  private renderText(
    text: string,
    personalisation: Record<string, any>,
    engine: TemplateEngine,
  ): string {
    switch (engine) {
      case TemplateEngine.LEGACY_GC_NOTIFY:
        return this.renderLegacyGcNotify(text, personalisation)
      case TemplateEngine.HANDLEBARS:
        return this.renderHandlebars(text, personalisation)
      case TemplateEngine.MUSTACHE:
        return this.renderMustache(text, personalisation)
      case TemplateEngine.EJS:
        return this.renderEjs(text, personalisation)
      default:
        return text
    }
  }

  /**
   * Render using legacy GC Notify syntax ((placeholder)) and ((placeholder??default))
   * Supports both simple variables and conditional fallback syntax
   */
  private renderLegacyGcNotify(template: string, personalisation: Record<string, any>): string {
    // Match both ((variable)) and ((variable??defaultValue))
    return template.replace(/\(\((\w+)(?:\?\?([^)]*))?\)\)/g, (match, key, defaultValue) => {
      const value = personalisation[key]
      // If value exists, use it; otherwise use default if provided, otherwise return empty string
      if (value !== undefined && value !== null) {
        return value.toString()
      }
      return defaultValue || ''
    })
  }

  /**
   * Render using Handlebars
   * Full support for conditionals, loops, and helpers
   */
  private renderHandlebars(template: string, personalisation: Record<string, any>): string {
    try {
      const compiled = Handlebars.compile(template)
      return compiled(personalisation)
    } catch (error) {
      throw new BadRequestException(`Handlebars rendering error: ${(error as Error).message}`)
    }
  }

  /**
   * Render using Mustache
   * Logic-less templates with sections and simple loops
   */
  private renderMustache(template: string, personalisation: Record<string, any>): string {
    try {
      return Mustache.render(template, personalisation)
    } catch (error) {
      throw new BadRequestException(`Mustache rendering error: ${(error as Error).message}`)
    }
  }

  /**
   * Render using EJS
   * Full JavaScript template syntax with conditionals and loops
   */
  private renderEjs(template: string, personalisation: Record<string, any>): string {
    try {
      return EJS.render(template, personalisation, { async: false })
    } catch (error) {
      throw new BadRequestException(`EJS rendering error: ${(error as Error).message}`)
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
