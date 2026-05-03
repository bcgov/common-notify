import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  Version,
  UseGuards,
  Logger,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import * as express from 'express'
import { TenantGuard } from '../../common/guards/tenant.guard'
import { GetTenant } from '../../common/decorators/get-tenant.decorator'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { TemplatesService } from './templates.service'
import { CreateTemplateDto } from './schemas/create-template.dto'
import { PreviewTemplateDto } from './schemas/preview-template.dto'
import { TemplateResponseDto } from './schemas/template-response.dto'
import { UpdateTemplateDto } from './schemas/update-template.dto'

/**
 * Templates API Controller
 * Provides REST endpoints for template management
 *
 * Routes:
 * - GET /templates - List all templates for the tenant
 * - POST /templates - Create a new template
 * - GET /templates/:templateId - Get a specific template
 * - PATCH /templates/:templateId - Update a template
 * - DELETE /templates/:templateId - Delete a template
 * - POST /templates/:templateId/preview - Preview a template with sample data
 */
@ApiTags('templates')
@Controller('templates')
@UseGuards(TenantGuard)
@ApiBearerAuth()
export class TemplatesController {
  private readonly logger = new Logger(TemplatesController.name)

  constructor(private readonly templatesService: TemplatesService) {}

  /**
   * List all templates for the tenant
   *
   * @param tenant Current tenant from JWT
   * @param page Page number (1-indexed, default: 1)
   * @param limit Items per page (default: 10, max: 100)
   * @returns Paginated list of templates
   */
  @Version('1')
  @Get()
  @HttpCode(200)
  @ApiOperation({ summary: 'List all templates for the authenticated tenant' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Page number (1-indexed)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 10,
    description: 'Items per page (max 100)',
  })
  @ApiOkResponse({ type: [TemplateResponseDto] })
  async listTemplates(
    @GetTenant() tenant: Tenant,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<TemplateResponseDto[]> {
    const pageNum = page ? parseInt(page, 10) : 1
    const limitNum = limit ? parseInt(limit, 10) : 10
    return this.templatesService.listTemplates(tenant.id, pageNum, limitNum)
  }

  /**
   * Get a specific template by ID
   *
   * @param tenant Current tenant from JWT
   * @param templateId Template ID
   * @returns Template details
   */
  @Version('1')
  @Get(':templateId')
  @HttpCode(200)
  async getTemplate(
    @GetTenant() tenant: Tenant,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
  ): Promise<TemplateResponseDto> {
    return this.templatesService.getTemplate(tenant.id, templateId)
  }

  /**
   * Create a new template
   *
   * @param tenant Current tenant from JWT
   * @param createTemplateDto Template creation data
   * @returns Created template
   */
  @Version('1')
  @Post()
  @HttpCode(201)
  async createTemplate(
    @GetTenant() tenant: Tenant,
    @Body() createTemplateDto: CreateTemplateDto,
    @Req() req?: express.Request,
  ): Promise<TemplateResponseDto> {
    const user = this.extractUserFromRequest(req)
    return this.templatesService.createTemplate(tenant.id, createTemplateDto, user)
  }

  /**
   * Update an existing template
   * Creates a new version while keeping the old one in history
   *
   * @param tenant Current tenant from JWT
   * @param templateId Template ID
   * @param updateTemplateDto Template update data
   * @returns Updated template
   */
  @Version('1')
  @Patch(':templateId')
  @HttpCode(200)
  async updateTemplate(
    @GetTenant() tenant: Tenant,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
    @Req() req?: express.Request,
  ): Promise<TemplateResponseDto> {
    const user = this.extractUserFromRequest(req)
    return this.templatesService.updateTemplate(tenant.id, templateId, updateTemplateDto, user)
  }

  /**
   * Delete a template
   * Note: This soft-deletes by marking as inactive
   *
   * @param tenant Current tenant from JWT
   * @param templateId Template ID
   */
  @Version('1')
  @Delete(':templateId')
  @HttpCode(204)
  async deleteTemplate(
    @GetTenant() tenant: Tenant,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
  ): Promise<void> {
    await this.templatesService.deleteTemplate(tenant.id, templateId)
  }

  /**
   * Preview a template with sample data
   * Renders the template with provided parameters without storing anything
   *
   * @param tenant Current tenant from JWT
   * @param templateId Template ID
   * @param previewDto Template data for preview
   * @returns Rendered template output
   */
  @Version('1')
  @Post(':templateId/preview')
  @HttpCode(200)
  async previewTemplate(
    @GetTenant() tenant: Tenant,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
    @Body() previewDto: PreviewTemplateDto,
  ): Promise<any> {
    return this.templatesService.previewTemplate(tenant.id, templateId, previewDto)
  }

  /**
   * Extract user information from the request
   * Checks JWT claims and Kong headers for user identifier
   */
  private extractUserFromRequest(req?: express.Request): string {
    if (!req) return 'system'

    try {
      // Try to get user from Kong headers
      const kongUsername = req.headers['x-consumer-username']
      if (kongUsername) return kongUsername as string

      // Try to get user from JWT
      const authHeader = req.headers.authorization
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        const parts = token.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'))
          // Try various claim names for user identifier
          return (
            payload.preferred_username || payload.email || payload.name || payload.sub || 'system'
          )
        }
      }
    } catch (error) {
      this.logger.warn('Failed to extract user from request:', (error as Error).message)
    }

    return 'system'
  }
}
