import {
  Controller,
  Get,
  Post,
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
import { JwtUserExtractor } from '../../common/utils/jwt-user-extractor'
import { TemplatesService } from './templates.service'
import { CreateTemplateDto } from './schemas/create-template.dto'
import { PreviewTemplateDto } from './schemas/preview-template.dto'
import { TemplateResponseDto } from './schemas/template-response.dto'
import { UpdateTemplateDto } from './schemas/update-template.dto'
import { PaginatedTemplateResponse } from './schemas/paginated-template-response'

/**
 * Frontend Templates API Controller
 *
 * ARCHITECTURAL NOTE: This controller intentionally duplicates methods from TemplatesController
 * because the API Gateway requires separate routing:
 * - TemplatesController: /api/v1/templates (service-to-service auth)
 * - TemplatesFrontendController: /api/v1/frontend/templates (frontend auth)
 *
 * The different route prefixes enable the gateway to apply different authentication
 * rules based on client type (internal service vs frontend application).
 * Both controllers delegate to the same TemplatesService for consistency.
 *
 * If the gateway configuration changes to support a single route with conditional auth,
 * these controllers can be consolidated.
 */
@ApiTags('templates')
@Controller('frontend/templates')
@UseGuards(TenantGuard)
@ApiBearerAuth()
export class TemplatesFrontendController {
  private readonly logger = new Logger(TemplatesFrontendController.name)

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
  @ApiOperation({ summary: 'List all templates for the specified tenant' })
  @ApiQuery({
    name: 'tenantId',
    required: true,
    type: String,
    description: 'CSTAR external tenant ID to filter by',
  })
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
  @ApiOkResponse({ type: PaginatedTemplateResponse })
  async listTemplates(
    @Query('tenantId') tenantExternalId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedTemplateResponse> {
    const pageNum = page ? parseInt(page, 10) : 1
    const limitNum = limit ? parseInt(limit, 10) : 10
    return this.templatesService.listTemplatesByExternalId(tenantExternalId, pageNum, limitNum)
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
    const user = JwtUserExtractor.extractUser(req)
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
  @Post(':templateId')
  @HttpCode(200)
  async updateTemplate(
    @GetTenant() tenant: Tenant,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
    @Req() req?: express.Request,
  ): Promise<TemplateResponseDto> {
    const user = JwtUserExtractor.extractUser(req)
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
}
