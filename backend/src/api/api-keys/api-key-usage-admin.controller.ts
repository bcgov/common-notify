import {
  Body,
  Controller,
  Get,
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
  AdminTenantUsageRowDto,
  AdminUsageSummaryDto,
  PaginatedAdminUsageResponseDto,
} from './schemas/tenant-usage-response.dto'
import { UpdateTenantLimitsDto } from './schemas/update-tenant-limits.dto'
import { AdminUsageQueryDto } from './schemas/admin-usage-query.dto'

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
  constructor(private readonly apiKeyUsageService: ApiKeyUsageService) {}

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
}
