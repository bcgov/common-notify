import { Body, Controller, Get, Patch, Req, Request, UseGuards, Version } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Roles } from '../../common/decorators/roles.decorator'
import { CstarRole as CstarRoleEnum } from '../../enum/cstar-role.enum'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import type { Tenant } from '../admin/tenants/entities/tenant.entity'
import { ApiKeyUsageService } from './api-key-usage.service'
import { UpdateThresholdDto } from './dto/update-threshold.dto'
import { TenantUsageResponseDto, UsageHistoryEntryDto } from './dto/tenant-usage-response.dto'

/**
 * Frontend API Controller for notification limits and usage.
 *
 * ARCHITECTURAL NOTE: Like NotificationFrontendController, this controller is the
 * frontend-facing surface ( /api/v1/frontend/api-key-usage ). It is called by the
 * Notify web app with a user JWT — never with a service API key. The
 * NotifyFrontendRoleGuard authenticates the user, resolves the tenant from the
 * x-tenant-id header (attached as request.tenant), and enforces CSTAR roles.
 *
 * Any tenant role may read the stats; only NOTIFY_OPERATIONS_ADMIN may change the
 * alert threshold.
 */
@ApiTags('api-key-usage')
@Controller('frontend/api-key-usage')
@UseGuards(NotifyFrontendRoleGuard)
@ApiBearerAuth()
export class ApiKeyUsageFrontendController {
  constructor(private readonly apiKeyUsageService: ApiKeyUsageService) {}

  @Version('1')
  @Get()
  @Roles(
    CstarRoleEnum.NOTIFY_VIEWER,
    CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR,
    CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN,
  )
  @ApiOperation({ summary: 'Get notification usage vs limits for the authenticated tenant' })
  @ApiOkResponse({ type: TenantUsageResponseDto })
  getUsage(@Req() req: Request): Promise<TenantUsageResponseDto> {
    const tenant = (req as any).tenant as Tenant
    return this.apiKeyUsageService.getTenantUsage(tenant.id)
  }

  @Version('1')
  @Get('history')
  @Roles(
    CstarRoleEnum.NOTIFY_VIEWER,
    CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR,
    CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN,
  )
  @ApiOperation({ summary: 'Get per-fiscal-year usage history for the authenticated tenant' })
  @ApiOkResponse({ type: [UsageHistoryEntryDto] })
  getHistory(@Req() req: Request): Promise<UsageHistoryEntryDto[]> {
    const tenant = (req as any).tenant as Tenant
    return this.apiKeyUsageService.getUsageHistory(tenant.id)
  }

  @Version('1')
  @Patch('threshold')
  @Roles(CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({
    summary: 'Update the alert threshold for a channel (NOTIFY_OPERATIONS_ADMIN only)',
  })
  @ApiOkResponse({ type: TenantUsageResponseDto })
  updateThreshold(
    @Req() req: Request,
    @Body() dto: UpdateThresholdDto,
  ): Promise<TenantUsageResponseDto> {
    const tenant = (req as any).tenant as Tenant
    const userGuid = (req as any).userGuid as string | undefined
    return this.apiKeyUsageService.updateThreshold(
      tenant.id,
      dto.channel,
      dto.warnThresholdPercent,
      userGuid,
    )
  }
}
