import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  Version,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { Roles } from '../../common/decorators/roles.decorator'
import { CstarRole as CstarRoleEnum } from '../../enum/cstar-role.enum'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import type { Tenant } from '../admin/tenants/entities/tenant.entity'
import { ApiKeyIssuanceService } from './api-key-issuance.service'
import { IssueApiKeyDto } from './schemas/issue-api-key.dto'
import { UpdateApiKeyNotesDto } from './schemas/update-api-key-notes.dto'
import { ApiKeySummaryDto, IssuedApiKeyDto } from './schemas/api-key-response.dto'

/**
 * Self-service API key management for the Notify web app.
 *
 * Replaces the manual onboarding path. Previously a team had to request a key in the
 * API Services Portal, create a tenant in CSTAR, and then bind the two together by
 * hand. Now the tenant is created in CSTAR and the key is requested here — the
 * gateway mints it and Notify binds it to the tenant in the same request.
 *
 * Called by the web app with a user JWT, never with a service API key.
 * NotifyFrontendRoleGuard authenticates the user, resolves the tenant from the
 * x-tenant-id header, and confirms CSTAR membership — so by the time a handler runs,
 * the caller's right to hold a key for this tenant is already established.
 *
 * Key management is restricted to NOTIFY_OPERATIONS_ADMIN: a key grants the ability
 * to send on the tenant's behalf, which is a strictly wider power than editing
 * templates or reading usage.
 *
 * A tenant holds one key today (see MAX_KEYS_PER_TENANT). The routes are shaped as a
 * collection anyway so allowing more later is a config change rather than an API break.
 *
 * There is no revoke route. Revoking is done on the API Services Portal Consumers page,
 * which is the only place that actually stops the gateway honouring the key.
 */
@ApiTags('api-keys')
@Controller('frontend/api-keys')
@UseGuards(NotifyFrontendRoleGuard)
@ApiBearerAuth()
export class ApiKeysFrontendController {
  constructor(private readonly issuanceService: ApiKeyIssuanceService) {}

  @Version('1')
  @Get()
  @Roles(CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'List the API keys bound to the authenticated tenant' })
  @ApiOkResponse({ type: [ApiKeySummaryDto] })
  list(@Req() req: Request): Promise<ApiKeySummaryDto[]> {
    const tenant = (req as any).tenant as Tenant
    return this.issuanceService.listForTenant(tenant.id)
  }

  @Version('1')
  @Post()
  @Roles(CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Issue a new API key for the authenticated tenant',
    description:
      'Requests a credential from the API gateway and binds it to this tenant. The key ' +
      'value is returned once and is not recoverable afterwards.',
  })
  @ApiCreatedResponse({ type: IssuedApiKeyDto })
  @ApiResponse({ status: 403, description: 'Caller lacks NOTIFY_OPERATIONS_ADMIN on this tenant' })
  @ApiResponse({ status: 409, description: 'The tenant already holds a key — regenerate instead' })
  @ApiResponse({ status: 503, description: 'The API gateway is unavailable or not configured' })
  issue(@Req() req: Request, @Body() dto: IssueApiKeyDto): Promise<IssuedApiKeyDto> {
    const tenant = (req as any).tenant as Tenant
    const idirUserGuid = (req as any).userGuid as string

    return this.issuanceService.issueForTenant({ tenant, idirUserGuid, notes: dto.notes })
  }

  @Version('1')
  @Patch(':clientId')
  @Roles(CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update the note recorded against a key',
    description:
      'The note is free text the tenant keeps for itself, typically where the key was ' +
      'stored. It is set after issuing because that is the order the user works in.',
  })
  @ApiOkResponse({ type: ApiKeySummaryDto })
  @ApiResponse({ status: 404, description: 'No key with that clientId for this tenant' })
  updateNotes(
    @Req() req: Request,
    @Param('clientId') clientId: string,
    @Body() dto: UpdateApiKeyNotesDto,
  ): Promise<ApiKeySummaryDto> {
    const tenant = (req as any).tenant as Tenant

    return this.issuanceService.updateNotes({
      tenantId: tenant.id,
      clientId,
      notes: dto.notes,
    })
  }

  @Version('1')
  @Post(':clientId/regenerate')
  @Roles(CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate an API key in place',
    description:
      'Issues a new key value for the same clientId. Limits, usage history and alert ' +
      'configuration are preserved; the previous key value stops working immediately.',
  })
  @ApiOkResponse({ type: IssuedApiKeyDto })
  @ApiResponse({ status: 404, description: 'No key with that clientId for this tenant' })
  regenerate(@Req() req: Request, @Param('clientId') clientId: string): Promise<IssuedApiKeyDto> {
    const tenant = (req as any).tenant as Tenant
    const idirUserGuid = (req as any).userGuid as string

    return this.issuanceService.regenerate({ tenantId: tenant.id, clientId, idirUserGuid })
  }
}
