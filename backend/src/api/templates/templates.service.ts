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
import { PreviewTemplateBodyDto } from './schemas/preview-template-body.dto'
import { ConfigService } from '@nestjs/config'
import { InlineRenderingService } from '../../services/rendering/inline-rendering.service'
import type { NotifyContent } from '../notify/schemas/notify-content'
import { TemplateResponseDto } from './schemas/template-response.dto'
import { PaginatedTemplateResponse } from './schemas/paginated-template-response'
import { TEMPLATE_RENDERER_REGISTRY_TOKEN } from '../../services/rendering/tokens'
import { ITemplateRendererRegistry } from '../../adapters/interfaces'
import type { TemplateDefinition } from '../../adapters/interfaces'
import { TenantsService } from '../admin/tenants/tenants.service'
import type { ParsedListQuery } from '../../common/query/list-query.types'
import {
  extractTemplatePersonalisationKeys,
  describeTemplatePlaceholders,
} from '../../services/rendering/template-personalisation-validation'
import { toEmailHtml } from '../../services/rendering/email-body-html'

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
    private readonly inlineRenderingService: InlineRenderingService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * List all active templates for a tenant
   * @param tenantId The tenant ID
   * @param parsedQuery Parsed list query with pagination, sort, and filter
   */
  async listTemplates(
    tenantId: string,
    parsedQuery: ParsedListQuery,
    search?: string,
  ): Promise<PaginatedTemplateResponse> {
    // Extract pagination info from parsed query
    const page = parsedQuery.page
    const limit = parsedQuery.limit

    // Query templates using the parsed query (with filters and sorts applied)
    const [templates, total] = await this.templatesRepository.findWithQuery(
      tenantId,
      parsedQuery,
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
   * Get a specific template
   */
  async getTemplate(tenantId: string, templateId: string): Promise<TemplateResponseDto> {
    const template = await this.templatesRepository.findById(tenantId, templateId)
    if (!template) {
      throw new NotFoundException(`Template ${templateId} not found`)
    }
    // Only the single-template read carries the placeholder report: it is what the bulk-send screen
    // builds its spreadsheet columns from, and parsing every template in a list would be wasted work.
    return { ...this.toResponseDto(template), placeholders: describeTemplatePlaceholders(template) }
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
    // SMS carries no formatting, so its body is stored and sent as plain text.
    const bodyType = this.defaultBodyType(engineCode, createDto.channelCode)

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
    if (template.channelCode === NotificationChannel.SMS) {
      // SMS carries no formatting; the body is always sent verbatim.
      template.bodyType = 'text'
    } else if (nextEngineCode === TemplateEngine.MJML) {
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
      // What the recipient's mail client would show. Produced by the same converter the CHES
      // transport uses at send time, so the preview cannot drift from the delivered email. SMS and
      // plain-text bodies carry no markup and are left for the caller to render as text.
      html:
        rendered.bodyType === 'text' ? undefined : toEmailHtml(rendered.body, rendered.bodyType),
      // The address the send would actually use. Resolved the same way the transport resolves it,
      // rather than from the tenant's default_sender_email - that setting is stored and displayed
      // but is not consulted at send time, so showing it here would preview a lie.
      from:
        this.configService.get<string>('ches.from') ??
        this.configService.get<string>('defaults.email.from'),
    }
  }

  /**
   * Preview arbitrary template content (not a stored template)
   * Renders the provided body/subject with the given engine and sample data,
   * so the frontend can preview the current, possibly-unsaved, editor content.
   */
  async previewTemplateBody(previewDto: PreviewTemplateBodyDto): Promise<{
    channelCode: NotificationChannel
    subject?: string
    body: string
    bodyType: 'text' | 'markdown' | 'html'
    /** The body as HTML, as the recipient would receive it. Absent for plain-text bodies. */
    html?: string
  }> {
    const content: NotifyContent = {
      body: previewDto.body,
      subject: previewDto.subject,
      renderer: previewDto.engineCode as NotifyContent['renderer'],
    }
    const params = previewDto.params || {}

    if (previewDto.channelCode === NotificationChannel.EMAIL) {
      const rendered = await this.inlineRenderingService.renderEmail(content, params)
      const bodyType = previewDto.engineCode === TemplateEngine.MJML ? 'html' : 'markdown'
      return {
        channelCode: previewDto.channelCode,
        subject: rendered.subject,
        body: rendered.body,
        bodyType,
        // See previewTemplate: the same converter the CHES transport uses at send time.
        html: toEmailHtml(rendered.body, bodyType),
      }
    }

    const rendered = await this.inlineRenderingService.renderSms(content, params)
    return {
      channelCode: previewDto.channelCode,
      body: rendered.body,
      bodyType: 'markdown',
    }
  }

  /**
   * Render template content (subject and/or body) with personalisation data
   * Used by delivery workers to render templates before sending
   * Returns raw body with bodyType flag - adapter will handle format conversion
   *
   * SMS templates render through the renderer's SMS path and always come back as 'text':
   * an SMS carries no formatting, so the body is sent exactly as written with no markdown
   * conversion, no MJML compilation, and no HTML escaping of personalisation values.
   *
   * @param template The template to render
   * @param personalisation The data to use for rendering (e.g., request.params)
   * @param bodyType Optional override for body content type. Ignored for SMS templates.
   * @returns Object with rendered subject, body, and bodyType
   */
  public async renderTemplateContent(
    template: Template,
    personalisation: Record<string, any> = {},
    bodyType?: 'markdown',
  ): Promise<{ subject?: string; body: string; bodyType: 'text' | 'markdown' | 'html' }> {
    const normalizedPersonalisation = personalisation ?? {}

    this.validateTemplatePersonalisation(template, normalizedPersonalisation)

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

    const renderPersonalisation =
      template.engineCode === TemplateEngine.LEGACY_GC_NOTIFY
        ? Object.fromEntries(
            Object.entries(normalizedPersonalisation).map(([key, value]) => [
              key,
              value !== null && value !== undefined ? String(value) : '',
            ]),
          )
        : normalizedPersonalisation

    // Render the template
    const renderContext = {
      template: templateDef,
      personalisation: renderPersonalisation,
    }

    // SMS goes through the renderer's plain-text path; the stored bodyType and any caller
    // override do not apply, because an SMS is only ever plain text.
    if (template.channelCode === NotificationChannel.SMS) {
      const renderedSms = await renderer.renderSms(renderContext)
      return { body: renderedSms.body, bodyType: 'text' }
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
   * Body type a new template is stored with. SMS is always plain text — it has no formatting
   * and is sent verbatim. MJML is null because it compiles to HTML on its own.
   */
  private defaultBodyType(
    engineCode: TemplateEngine,
    channelCode: NotificationChannel,
  ): 'text' | 'markdown' | null {
    if (channelCode === NotificationChannel.SMS) return 'text'
    return engineCode === TemplateEngine.MJML ? null : 'markdown'
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

  private validateTemplatePersonalisation(
    template: Template,
    personalisation: Record<string, any>,
  ): void {
    const requiredKeys = extractTemplatePersonalisationKeys(template, personalisation)

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
