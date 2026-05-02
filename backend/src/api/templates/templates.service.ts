import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import * as Handlebars from 'handlebars'
import * as Mustache from 'mustache'
import * as EJS from 'ejs'
import { Template } from './entities/template.entity'
import { TemplateEngine } from '../../enum/template-engine.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { TemplatesRepository } from './templates.repository'

/**
 * Service for template business logic
 * Handles template CRUD operations, versioning, and rendering
 */
@Injectable()
export class TemplatesService {
  constructor(private readonly templatesRepository: TemplatesRepository) {}

  /**
   * List all active templates for a tenant
   */
  async listTemplates(tenantId: string, page: number = 1, limit: number = 10): Promise<any[]> {
    // Convert page number to offset (1-indexed to 0-indexed)
    const offset = (page - 1) * limit
    const [templates] = await this.templatesRepository.findByTenantId(tenantId, limit, offset)
    return templates.map((t) => this.toResponseDto(t))
  }

  /**
   * Get a specific template
   */
  async getTemplate(tenantId: string, templateId: string): Promise<any> {
    const template = await this.templatesRepository.findById(tenantId, templateId)
    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`)
    }
    return this.toResponseDto(template)
  }

  /**
   * Create a new template
   */
  async createTemplate(tenantId: string, createDto: any): Promise<any> {
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
      version: 1,
      active: true,
      createdBy: 'system', // TODO: Get from JWT
      updatedBy: 'system',
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
      createdBy: 'system', // TODO: Get from JWT
    })

    return this.toResponseDto(template)
  }

  /**
   * Update a template (creates a new version)
   */
  async updateTemplate(tenantId: string, templateId: string, updateDto: any): Promise<any> {
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
    template.updatedBy = 'system' // TODO: Get from JWT

    const updated = await this.templatesRepository.update(template)

    // Version record is automatically created by database trigger (V15 migration)
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
  async previewTemplate(tenantId: string, templateId: string, previewDto: any): Promise<any> {
    const template = await this.templatesRepository.findById(tenantId, templateId)
    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`)
    }

    // Render the template based on the engine
    const rendered = await this.renderTemplate(template, previewDto.personalisation || {})

    return {
      templateId: template.id,
      channelCode: template.channelCode,
      subject: template.subject
        ? this.renderText(
            template.subject,
            previewDto.personalisation || {},
            template.engineCode as TemplateEngine,
          )
        : undefined,
      body: rendered,
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
