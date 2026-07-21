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
  BadRequestException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import * as express from 'express'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CstarRole as CstarRoleEnum } from '../../enum/cstar-role.enum'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { TenantsService } from '../admin/tenants/tenants.service'
import { JwtUserExtractor } from '../../common/utils/jwt-user-extractor'
import { TemplatesService } from './templates.service'
import { CreateTemplateDto } from './schemas/create-template.dto'
import { PreviewTemplateDto } from './schemas/preview-template.dto'
import { PreviewTemplateBodyDto } from './schemas/preview-template-body.dto'
import { TemplateResponseDto } from './schemas/template-response.dto'
import { UpdateTemplateDto } from './schemas/update-template.dto'
import { PaginatedTemplateResponse } from './schemas/paginated-template-response'
import { TemplateListQueryDto } from './schemas/template-list-query.dto'
import { parseListQuery } from '../../common/query/list-query.parser'
import type { QueryableFieldsConfig } from '../../common/query/list-query.types'

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
@UseGuards(NotifyFrontendRoleGuard)
@ApiBearerAuth()
export class TemplatesFrontendController {
  private readonly logger = new Logger(TemplatesFrontendController.name)

  // Template list queryable fields configuration
  private readonly templateListQueryConfig: QueryableFieldsConfig = {
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

  constructor(
    private readonly templatesService: TemplatesService,
    private readonly tenantsService: TenantsService,
  ) {}

  private async requireTenantContext(req: Request | express.Request): Promise<Tenant> {
    const tenant = (req as any).tenant as Tenant | undefined
    if (tenant?.id) {
      return tenant
    }

    const tenantExternalId = ((req.headers as any)?.['x-tenant-id'] as string | undefined)?.trim()
    if (!tenantExternalId) {
      this.logger.error('Tenant context missing and x-tenant-id header was not provided')
      throw new BadRequestException(
        'Tenant context is missing from request. Ensure x-tenant-id is provided and authorized.',
      )
    }

    this.logger.warn(
      `Tenant context missing on request. Falling back to x-tenant-id lookup: ${tenantExternalId}`,
    )

    const resolvedTenant = await this.tenantsService.findByExternalId(tenantExternalId)
    if (!resolvedTenant?.id) {
      throw new BadRequestException(
        `Tenant with ID "${tenantExternalId}" does not exist. Please verify the tenant ID and try again.`,
      )
    }

    return resolvedTenant
  }

  /**
   * List all templates for the tenant
   *
   * @param req Request, used to resolve the authenticated tenant context
   * @param query List query parameters (pagination, sort, filter)
   * @returns Paginated list of templates with advanced filtering & sorting
   */
  @Version('1')
  @Get()
  @HttpCode(200)
  @Roles(
    CstarRoleEnum.NOTIFY_VIEWER,
    CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR,
    CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN,
  )
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
  @ApiQuery({
    name: 'sort',
    required: false,
    type: String,
    example: '-updatedAt,name',
    description: 'Sort fields separated by commas. Prefix with - for DESC.',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    type: String,
    isArray: true,
    example: ['channelCode:eq:EMAIL', 'name:like:welcome'],
    description: 'Filters using field:operator:value. Repeat query param for multiple filters.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    example: 'welcome',
    description: 'Case-insensitive search across template title and description.',
  })
  @ApiOkResponse({ type: PaginatedTemplateResponse })
  async listTemplates(
    @Req() req: Request,
    @Query() query: TemplateListQueryDto,
  ): Promise<PaginatedTemplateResponse> {
    const tenant = await this.requireTenantContext(req)
    const parsedQuery = parseListQuery(query, this.templateListQueryConfig)
    return this.templatesService.listTemplates(tenant.id, parsedQuery, query.search)
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
  @Roles(
    CstarRoleEnum.NOTIFY_VIEWER,
    CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR,
    CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN,
  )
  async getTemplate(
    @Req() req: Request,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
  ): Promise<TemplateResponseDto> {
    const tenant = await this.requireTenantContext(req)
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
  @Roles(CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR, CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  async createTemplate(
    @Req() req: express.Request,
    @Body() createTemplateDto: CreateTemplateDto,
  ): Promise<TemplateResponseDto> {
    const tenant = await this.requireTenantContext(req)
    const user = JwtUserExtractor.extractUser(req)
    return this.templatesService.createTemplate(tenant.id, createTemplateDto, user)
  }

  /**
   * Preview arbitrary template content with sample data
   * Renders the provided body/subject without requiring a stored template,
   * so the editor can preview the current possibly unsaved content.
   * Tenant verification not needed as the template content comes from the
   * frontend and not the database.
   *
   * @param previewDto Body, subject, engine, channel and sample params
   * @returns Rendered template output
   */
  @Version('1')
  @Post('preview')
  @HttpCode(200)
  @Roles(
    CstarRoleEnum.NOTIFY_VIEWER,
    CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR,
    CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN,
  )
  @ApiOperation({ summary: 'Preview arbitrary template content with sample data' })
  async previewTemplateBody(@Body() previewDto: PreviewTemplateBodyDto): Promise<any> {
    return this.templatesService.previewTemplateBody(previewDto)
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
  @Roles(CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR, CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  async updateTemplate(
    @Req() req: express.Request,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
  ): Promise<TemplateResponseDto> {
    const tenant = await this.requireTenantContext(req)
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
  @Roles(CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR, CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  async deleteTemplate(
    @Req() req: Request,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
  ): Promise<void> {
    const tenant = await this.requireTenantContext(req)
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
  @Roles(CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR, CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  async previewTemplate(
    @Req() req: Request,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
    @Body() previewDto: PreviewTemplateDto,
  ): Promise<any> {
    const tenant = await this.requireTenantContext(req)
    return this.templatesService.previewTemplate(tenant.id, templateId, previewDto)
  }
}
