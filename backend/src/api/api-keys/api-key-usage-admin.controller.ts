import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  Request,
  UseGuards,
  Version,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiExcludeController,
} from '@nestjs/swagger'
import { NotifyAdminGuard } from '../../common/guards/notify-admin.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { SsoRole } from '../../enum/sso-role.enum'
import { ApiKeyUsageService, adminUsageListQueryConfig } from './api-key-usage.service'
import { parseListQuery } from '../../common/query/list-query.parser'
import {
  AdminTenantOptionDto,
  AdminTenantUsageRowDto,
  AdminUsageSummaryDto,
  PaginatedAdminUsageResponseDto,
} from './schemas/tenant-usage-response.dto'
import { UpdateTenantLimitsDto } from './schemas/update-tenant-limits.dto'
import { AdminUsageQueryDto } from './schemas/admin-usage-query.dto'
import type { Request as ExpressRequest } from 'express'
import { SetTenantSendingDto } from './schemas/set-tenant-sending.dto'
import { TenantsService } from '../admin/tenants/tenants.service'
import { JwtUserExtractor } from '../../common/utils/jwt-user-extractor'

/**
 * Admin API Controller for notification usage across all tenants.
 *
 * Route: /api/v1/frontend/admin/api-key-usage
 * Guarded by NotifyAdminGuard + NOTIFY_ADMIN (SSO role) — NOT tenant-scoped, so no
 * x-tenant-id header is required. Mirrors the feature-flag admin controller.
 */
@ApiTags('api-key-usage')
// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
@Controller('frontend/admin/api-key-usage')
@UseGuards(NotifyAdminGuard)
@ApiBearerAuth()
export class ApiKeyUsageAdminController {
  constructor(
    private readonly apiKeyUsageService: ApiKeyUsageService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Version('1')
  @Get()
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'Get notification usage vs limits for every tenant (admin only)' })
  @ApiOkResponse({ type: PaginatedAdminUsageResponseDto })
  getAllTenantsUsage(@Query() query: AdminUsageQueryDto): Promise<PaginatedAdminUsageResponseDto> {
    const parsedQuery = parseListQuery(query, adminUsageListQueryConfig)
    return this.apiKeyUsageService.getAllTenantsUsage(parsedQuery, query.search)
  }

  @Version('1')
  @Get('summary')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'How many tenants use Notify (admin only)' })
  @ApiOkResponse({ type: AdminUsageSummaryDto })
  getSummary(): Promise<AdminUsageSummaryDto> {
    return this.apiKeyUsageService.getAdminUsageSummary()
  }

  @Version('1')
  @Get('tenants')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'Every tenant the usage table lists, by name (admin only)' })
  @ApiOkResponse({ type: [AdminTenantOptionDto] })
  listTenants(): Promise<AdminTenantOptionDto[]> {
    return this.apiKeyUsageService.listNotifyTenants()
  }

  @Version('1')
  @Patch('limits')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: "Update a tenant's daily and annual limits for a channel (admin only)" })
  @ApiOkResponse({ type: [AdminTenantUsageRowDto] })
  updateTenantLimits(
    @Req() req: Request,
    @Body() dto: UpdateTenantLimitsDto,
  ): Promise<AdminTenantUsageRowDto[]> {
    const updatedBy = (req as any).user?.sub as string | undefined
    return this.apiKeyUsageService.updateTenantLimits(
      dto.tenantId,
      dto.channel,
      dto.dailyLimit,
      dto.annualLimit,
      updatedBy,
    )
  }

  @Version('1')
  @Patch('tenants/:tenantId/sending')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'Enable or disable sending for a tenant (admin only)' })
  @ApiOkResponse({ schema: { properties: { sendingEnabled: { type: 'boolean' } } } })
  async setTenantSending(
    @Req() req: ExpressRequest,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: SetTenantSendingDto,
  ): Promise<{ sendingEnabled: boolean }> {
    const sendingEnabled = await this.tenantsService.setSending(tenantId, dto.enabled, dto.reason, {
      id: JwtUserExtractor.extractUser(req),
      name: JwtUserExtractor.extractDisplayName(req),
    })
    return { sendingEnabled }
  }
}
