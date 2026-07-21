import { Body, Controller, Get, Patch, Req, Request, UseGuards, Version } from '@nestjs/common'
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Roles } from '../../common/decorators/roles.decorator'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { SsoRole } from '../../enum/sso-role.enum'
import type { Tenant } from '../admin/tenants/entities/tenant.entity'
import { TenantSettings } from './entities/tenant-settings.entity'
import { UpdateTenantSettingsDto } from './schemas/update-tenant-settings.dto'
import { TenantSettingsService } from './tenant-settings.service'

@ApiTags('tenant-settings')
@Controller('frontend/tenant-settings')
@UseGuards(NotifyFrontendRoleGuard)
@ApiBearerAuth()
export class TenantSettingsController {
  constructor(private readonly tenantSettingsService: TenantSettingsService) {}

  @Version('1')
  @Get()
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'Get settings for the authenticated tenant' })
  @ApiOkResponse({ type: TenantSettings })
  getSettings(@Req() req: Request): Promise<TenantSettings | null> {
    const tenant = (req as any).tenant as Tenant
    return this.tenantSettingsService.findByTenantId(tenant.id)
  }

  @Version('1')
  @Patch()
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'Update settings for the authenticated tenant' })
  @ApiOkResponse({ type: TenantSettings })
  updateSettings(
    @Req() req: Request,
    @Body() dto: UpdateTenantSettingsDto,
  ): Promise<TenantSettings> {
    const tenant = (req as any).tenant as Tenant
    const userGuid = (req as any).userGuid as string | undefined
    return this.tenantSettingsService.upsert(tenant.id, dto.alertEmail, userGuid)
  }
}
