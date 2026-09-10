import { Body, Controller, Get, Patch, Req, Request, UseGuards, Version } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiExcludeController,
} from '@nestjs/swagger'
import { Roles } from '../../common/decorators/roles.decorator'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { CstarRole } from '../../enum/cstar-role.enum'
import type { Tenant } from '../admin/tenants/entities/tenant.entity'
import { EmailLogoService } from '../email-logo/email-logo.service'
import { ApprovedEmailLogoDto } from '../email-logo/schemas/approved-email-logo.dto'
import { TenantSettings } from './entities/tenant-settings.entity'
import { UpdateEmailSettingsDto } from './schemas/update-email-settings.dto'
import { UpdateSmsSettingsDto } from './schemas/update-sms-settings.dto'
import { UpdateTenantSettingsDto } from './schemas/update-tenant-settings.dto'
import { TenantSettingsService } from './tenant-settings.service'

@ApiTags('tenant-settings')
// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
@Controller('frontend/tenant-settings')
@UseGuards(NotifyFrontendRoleGuard)
@ApiBearerAuth()
export class TenantSettingsController {
  constructor(
    private readonly tenantSettingsService: TenantSettingsService,
    private readonly emailLogoService: EmailLogoService,
  ) {}

  @Version('1')
  @Get()
  @Roles(
    CstarRole.NOTIFY_VIEWER,
    CstarRole.NOTIFY_TEMPLATE_EDITOR,
    CstarRole.NOTIFY_OPERATIONS_ADMIN,
  )
  @ApiOperation({ summary: 'Get all settings for the authenticated tenant' })
  @ApiOkResponse({ type: TenantSettings })
  getSettings(@Req() req: Request): Promise<TenantSettings | null> {
    const tenant = (req as any).tenant as Tenant
    return this.tenantSettingsService.findByTenantId(tenant.id)
  }

  @Version('1')
  @Get('email-logos')
  @Roles(
    CstarRole.NOTIFY_VIEWER,
    CstarRole.NOTIFY_TEMPLATE_EDITOR,
    CstarRole.NOTIFY_OPERATIONS_ADMIN,
  )
  @ApiOperation({ summary: 'List approved email logos available to the tenant' })
  @ApiOkResponse({ isArray: true, type: ApprovedEmailLogoDto })
  async getApprovedEmailLogos(): Promise<ApprovedEmailLogoDto[]> {
    const logos = await this.emailLogoService.findApproved()

    return logos.map(({ id, name }) => ({
      id,
      name,
      imageUrl: this.emailLogoService.buildPublicImageUrl(id),
    }))
  }

  // Tenant tab update
  @Version('1')
  @Patch('tenant')
  @Roles(CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'Update tenant settings for the authenticated tenant' })
  @ApiOkResponse({ type: TenantSettings })
  updateTenantSettings(
    @Req() req: Request,
    @Body() dto: UpdateTenantSettingsDto,
  ): Promise<TenantSettings> {
    const tenant = (req as any).tenant as Tenant
    const userGuid = (req as any).userGuid as string | undefined
    return this.tenantSettingsService.upsert(tenant.id, dto, userGuid)
  }

  // Email tab update
  @Version('1')
  @Patch('email')
  @Roles(CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'Update email settings for the authenticated tenant' })
  @ApiOkResponse({ type: TenantSettings })
  updateEmailSettings(
    @Req() req: Request,
    @Body() dto: UpdateEmailSettingsDto,
  ): Promise<TenantSettings> {
    const tenant = (req as any).tenant as Tenant
    const userGuid = (req as any).userGuid as string | undefined
    return this.tenantSettingsService.upsertEmailSettings(tenant.id, dto, userGuid)
  }

  // SMS tab update
  @Version('1')
  @Patch('sms')
  @Roles(CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'Update SMS settings for the authenticated tenant' })
  @ApiOkResponse({ type: TenantSettings })
  updateSmsSettings(
    @Req() req: Request,
    @Body() dto: UpdateSmsSettingsDto,
  ): Promise<TenantSettings> {
    const tenant = (req as any).tenant as Tenant
    const userGuid = (req as any).userGuid as string | undefined
    return this.tenantSettingsService.upsertSmsSettings(tenant.id, dto, userGuid)
  }
}
