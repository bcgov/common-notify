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
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
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
  ): Promise<TemplateResponseDto> {
    return this.templatesService.createTemplate(tenant.id, createTemplateDto)
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
  ): Promise<TemplateResponseDto> {
    return this.templatesService.updateTemplate(tenant.id, templateId, updateTemplateDto)
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
}
