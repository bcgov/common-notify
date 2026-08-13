import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Request,
  UseGuards,
  Version,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger'
import { Roles } from '../../common/decorators/roles.decorator'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { SsoRole } from '../../enum/sso-role.enum'
import type { Tenant } from '../admin/tenants/entities/tenant.entity'
import { RecipientSafelist } from './entities/recipient-safelist.entity'
import { CreateSafelistEntryDto } from './schemas/create-safelist-entry.dto'
import { SafelistService } from './safelist.service'

/**
 * Tenant-facing management of the recipient safelist, surfaced on the Settings page.
 *
 * Reading the safelist works in every environment so administrators can see what is configured;
 * whether it is *enforced* is an environment-level question answered by `enforced` on the list
 * response (the `recipient_safelist` feature flag).
 */
@ApiTags('safelist')
@Controller('frontend/safelist')
@UseGuards(NotifyFrontendRoleGuard)
@ApiBearerAuth()
export class SafelistController {
  constructor(private readonly safelistService: SafelistService) {}

  @Version('1')
  @Get()
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'List safelisted recipients for the authenticated tenant' })
  @ApiQuery({ name: 'channel', required: false, enum: ['EMAIL', 'SMS'] })
  @ApiOkResponse({ type: [RecipientSafelist] })
  async list(
    @Req() req: Request,
    @Query('channel') channel?: string,
  ): Promise<{
    entries: RecipientSafelist[]
    enforced: boolean
    maxEntries: number
  }> {
    const tenant = (req as any).tenant as Tenant
    const [entries, enforced, maxEntries] = await Promise.all([
      this.safelistService.listByTenant(tenant.id, channel),
      this.safelistService.isEnforced(),
      this.safelistService.getMaxEntries(),
    ])
    return { entries, enforced, maxEntries }
  }

  @Version('1')
  @Post()
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'Add a recipient to the tenant safelist' })
  @ApiCreatedResponse({ type: RecipientSafelist })
  add(@Req() req: Request, @Body() dto: CreateSafelistEntryDto): Promise<RecipientSafelist> {
    const tenant = (req as any).tenant as Tenant
    const userGuid = (req as any).userGuid as string | undefined
    return this.safelistService.add(tenant.id, dto, userGuid)
  }

  @Version('1')
  @Delete(':id')
  @HttpCode(204)
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'Remove a recipient from the tenant safelist' })
  @ApiNoContentResponse()
  remove(@Req() req: Request, @Param('id') id: string): Promise<void> {
    const tenant = (req as any).tenant as Tenant
    const userGuid = (req as any).userGuid as string | undefined
    return this.safelistService.remove(tenant.id, id, userGuid)
  }
}
