import { Controller, Get, UseGuards, Version } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { NotifyAdminGuard } from '../../common/guards/notify-admin.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { SsoRole } from '../../enum/sso-role.enum'
import { ApiKeyUsageService } from './api-key-usage.service'
import { AdminTenantUsageRowDto } from './dto/tenant-usage-response.dto'

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
  @ApiOkResponse({ type: [AdminTenantUsageRowDto] })
  getAllTenantsUsage(): Promise<AdminTenantUsageRowDto[]> {
    return this.apiKeyUsageService.getAllTenantsUsage()
  }
}
