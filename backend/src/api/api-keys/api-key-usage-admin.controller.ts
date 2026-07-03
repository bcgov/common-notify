import { Body, Controller, Get, Patch, Query, Req, Request, UseGuards, Version } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { NotifyAdminGuard } from '../../common/guards/notify-admin.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { SsoRole } from '../../enum/sso-role.enum'
import { ApiKeyUsageService } from './api-key-usage.service'
import {
  AdminTenantUsageRowDto,
  PaginatedAdminUsageResponseDto,
} from './dto/tenant-usage-response.dto'
import { UpdateTenantLimitsDto } from './dto/update-tenant-limits.dto'

/**
 * Admin API Controller for notification usage across all tenants.
 *
 * Route: /api/v1/frontend/admin/api-key-usage
 * Guarded by NotifyAdminGuard + NOTIFY_ADMIN (SSO role) — NOT tenant-scoped, so no
 * x-tenant-id header is required. Mirrors the feature-flag admin controller.
 */
@ApiTags('api-key-usage')
@Controller('frontend/admin/api-key-usage')
@UseGuards(NotifyAdminGuard)
@ApiBearerAuth()
export class ApiKeyUsageAdminController {
  constructor(private readonly apiKeyUsageService: ApiKeyUsageService) {}

  @Version('1')
  @Get()
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'Get notification usage vs limits for every tenant (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 15 })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Filter tenants by name (case-insensitive substring)',
  })
  @ApiOkResponse({ type: PaginatedAdminUsageResponseDto })
  getAllTenantsUsage(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ): Promise<PaginatedAdminUsageResponseDto> {
    return this.apiKeyUsageService.getAllTenantsUsage({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
    })
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
