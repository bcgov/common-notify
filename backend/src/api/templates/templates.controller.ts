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
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
  ApiParam,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger'
import * as express from 'express'
import { NotifyServiceGuard } from '../../common/guards/notify-service.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CstarRole as CstarRoleEnum } from '../../enum/cstar-role.enum'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { JwtUserExtractor } from '../../common/utils/jwt-user-extractor'
import { TemplatesService } from './templates.service'
import { CreateTemplateDto } from './schemas/create-template.dto'
import { PreviewTemplateDto } from './schemas/preview-template.dto'
import { TemplateResponseDto } from './schemas/template-response.dto'
import { UpdateTemplateDto } from './schemas/update-template.dto'
import { PaginatedTemplateResponse } from './schemas/paginated-template-response'
import { ListQueryDto } from '../../common/query/list-query.dto'
import { parseListQuery } from '../../common/query/list-query.parser'
import type { QueryableFieldsConfig } from '../../common/query/list-query.types'

/**
 * Templates API Controller
 * Provides REST endpoints for template management
 *
 * Routes:
 * - GET /templates - List all templates for the tenant (supports advanced filtering & sorting)
 * - POST /templates - Create a new template
 * - GET /templates/:templateId - Get a specific template
 * - PATCH /templates/:templateId - Update a template
 * - DELETE /templates/:templateId - Delete a template
 * - POST /templates/:templateId/preview - Preview a template with sample data
 */
@ApiTags('Templates')
@ApiSecurity('api-key')
@Controller('templates')
@UseGuards(NotifyServiceGuard)
@ApiBearerAuth()
export class TemplatesController {
  private readonly logger = new Logger(TemplatesController.name)

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

  constructor(private readonly templatesService: TemplatesService) {}

  /**
   * List all templates for the tenant
   *
   * @param tenant Current tenant from JWT
   * @param query List query parameters (pagination, sort, filter)
   * @returns Paginated list of templates with advanced filtering & sorting
   */
  @Version('1')
  @Get()
  @HttpCode(200)
  @ApiOperation({
    summary: 'List templates',
    description:
      'Returns the templates belonging to the tenant the API key is bound to, newest first by ' +
      'default. Use `page` and `limit` to paginate, `sort` to order, and repeat `filter` to narrow ' +
      'the result set.',
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
  @ApiOkResponse({ type: PaginatedTemplateResponse })
  async listTemplates(
    @Req() req: Request,
    @Query() query: ListQueryDto,
  ): Promise<PaginatedTemplateResponse> {
    const tenant = (req as any).tenant as Tenant
    const parsedQuery = parseListQuery(query, this.templateListQueryConfig)
    return this.templatesService.listTemplates(tenant.id, parsedQuery)
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
  @ApiOperation({
    summary: 'Get a template',
    description:
      'Returns the current version of one template, including its body, subject and the ' +
      'parameters it expects.',
  })
  @ApiParam({
    name: 'templateId',
    format: 'uuid',
    example: '3f1a7c2e-9b45-4d10-8e21-6c0f5a9b7d33',
    description: 'Template ID.',
  })
  @ApiOkResponse({ description: 'The template.', type: TemplateResponseDto })
  @ApiResponse({ status: 404, description: 'No such template for this tenant.' })
  async getTemplate(
    @Req() req: Request,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
  ): Promise<TemplateResponseDto> {
    const tenant = (req as any).tenant as Tenant
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
  @ApiOperation({
    summary: 'Create a template',
    description:
      'Stores a reusable template so a send can reference it by `templateId` instead of carrying ' +
      'its content. Placeholders are filled from the `params` supplied at send time, using the ' +
      'rendering engine named here.',
  })
  @ApiBody({
    type: CreateTemplateDto,
    examples: {
      email: {
        summary: 'Email template',
        value: {
          name: 'Permit approved',
          description: 'Sent when a permit application is approved',
          channelCode: 'EMAIL',
          subject: 'Permit {{permitNumber}} approved',
          body: '<p>Hello {{firstName}},</p><p>Permit {{permitNumber}} has been approved.</p>',
          bodyType: 'html',
          engine: 'handlebars',
        },
      },
      sms: {
        summary: 'SMS template',
        value: {
          name: 'Appointment reminder',
          channelCode: 'SMS',
          body: 'Reminder: your appointment is at {{appointmentTime}} tomorrow.',
          engine: 'handlebars',
        },
      },
    },
  })
  @ApiCreatedResponse({ description: 'The created template.', type: TemplateResponseDto })
  @ApiResponse({ status: 400, description: 'Malformed request, or an unknown channel or engine.' })
  @ApiResponse({ status: 403, description: 'Requires the NOTIFY_TEMPLATE_EDITOR role.' })
  @Roles(CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR)
  async createTemplate(
    @Req() req: express.Request,
    @Body() createTemplateDto: CreateTemplateDto,
  ): Promise<TemplateResponseDto> {
    const tenant = (req as any).tenant as Tenant
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
  @Patch(':templateId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Update a template',
    description:
      'Applies the supplied fields and stores the result as a new version; earlier versions are ' +
      'kept, so notifications already scheduled against this template are unaffected.',
  })
  @ApiParam({
    name: 'templateId',
    format: 'uuid',
    example: '3f1a7c2e-9b45-4d10-8e21-6c0f5a9b7d33',
    description: 'Template ID.',
  })
  @ApiBody({
    type: UpdateTemplateDto,
    examples: {
      subjectOnly: {
        summary: 'Change the subject line',
        value: { subject: 'Permit {{permitNumber}} is ready for collection' },
      },
    },
  })
  @ApiOkResponse({ description: 'The updated template.', type: TemplateResponseDto })
  @ApiResponse({ status: 403, description: 'Requires the NOTIFY_TEMPLATE_EDITOR role.' })
  @ApiResponse({ status: 404, description: 'No such template for this tenant.' })
  @Roles(CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR)
  async updateTemplate(
    @Req() req: express.Request,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
  ): Promise<TemplateResponseDto> {
    const tenant = (req as any).tenant as Tenant
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
  @ApiOperation({
    summary: 'Delete a template',
    description:
      'Marks the template inactive so it can no longer be used for new sends. Existing ' +
      'notifications and version history are retained.',
  })
  @ApiParam({
    name: 'templateId',
    format: 'uuid',
    example: '3f1a7c2e-9b45-4d10-8e21-6c0f5a9b7d33',
    description: 'Template ID.',
  })
  @ApiResponse({ status: 204, description: 'Deleted.' })
  @ApiResponse({ status: 403, description: 'Requires the NOTIFY_TEMPLATE_EDITOR role.' })
  @ApiResponse({ status: 404, description: 'No such template for this tenant.' })
  @Roles(CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR)
  async deleteTemplate(
    @Req() req: Request,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
  ): Promise<void> {
    const tenant = (req as any).tenant as Tenant
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
  @ApiOperation({
    summary: 'Preview a template',
    description:
      'Renders the template with the parameters supplied and returns the result without sending ' +
      'or storing anything. Use it to check placeholders resolve before a real send.',
  })
  @ApiParam({
    name: 'templateId',
    format: 'uuid',
    example: '3f1a7c2e-9b45-4d10-8e21-6c0f5a9b7d33',
    description: 'Template ID.',
  })
  @ApiBody({
    type: PreviewTemplateDto,
    examples: {
      preview: {
        summary: 'Render with sample parameters',
        value: { params: { firstName: 'Alice', permitNumber: 'BC-2026-00417' } },
      },
    },
  })
  @ApiOkResponse({
    description: 'The rendered subject and body.',
    schema: {
      example: {
        subject: 'Permit BC-2026-00417 approved',
        body: '<p>Hello Alice,</p><p>Permit BC-2026-00417 has been approved.</p>',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'No such template for this tenant.' })
  async previewTemplate(
    @Req() req: Request,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
    @Body() previewDto: PreviewTemplateDto,
  ): Promise<any> {
    const tenant = (req as any).tenant as Tenant
    return this.templatesService.previewTemplate(tenant.id, templateId, previewDto)
  }
}
