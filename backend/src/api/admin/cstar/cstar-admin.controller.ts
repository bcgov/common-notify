import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  Version,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExcludeController,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import * as express from 'express'
import { NotifyAdminGuard } from '../../../common/guards/notify-admin.guard'
import { Roles } from '../../../common/decorators/roles.decorator'
import { SsoRole } from '../../../enum/sso-role.enum'
import { CstarApiClient } from '../../../services/cstar/cstar-api.client'
import {
  CstarSsoSearchUserDto,
  CstarTenantRoleDto,
  CstarTenantUserDto,
} from '../../../services/cstar/schemas/cstar.schema'
import { AddCstarTenantUserDto } from './schemas/add-cstar-tenant-user.dto'
import { CstarTenantUserQueryDto } from './schemas/cstar-tenant-user-query.dto'
import {
  CstarBceidSearchQueryDto,
  CstarIdirSearchQueryDto,
} from './schemas/cstar-user-search-query.dto'

/**
 * Manage the users of any CSTAR tenant on CSTAR's behalf.
 *
 * Route: /api/v1/frontend/admin/cstar
 * Guarded by NotifyAdminGuard + NOTIFY_ADMIN (SSO role); not tenant-scoped. The admin's own
 * token is passed through, which CSTAR accepts as a headless shared service token when the
 * admin is IDIR and the tenant uses Notify. CSTAR enforces the rest, and its refusals are
 * passed back.
 */
@ApiTags('admin-cstar')
// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
@Controller('frontend/admin/cstar')
@UseGuards(NotifyAdminGuard)
@ApiBearerAuth()
export class CstarAdminController {
  constructor(private readonly cstarApiClient: CstarApiClient) {}

  @Version('1')
  @Get('tenants/:tenantId/users')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: "List a CSTAR tenant's users (admin only)" })
  @ApiOkResponse({ type: [CstarTenantUserDto] })
  listTenantUsers(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Req() req: express.Request,
  ): Promise<CstarTenantUserDto[]> {
    return this.cstarApiClient.getTenantUsers(tenantId, req.headers.authorization)
  }

  @Version('1')
  @Get('tenants/:tenantId/users/:tenantUserId')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'A user of a CSTAR tenant (admin only)' })
  @ApiOkResponse({ type: CstarTenantUserDto })
  getTenantUser(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('tenantUserId', ParseUUIDPipe) tenantUserId: string,
    @Query() query: CstarTenantUserQueryDto,
    @Req() req: express.Request,
  ): Promise<CstarTenantUserDto> {
    return this.cstarApiClient.getTenantUser(
      tenantId,
      tenantUserId,
      query.expand,
      req.headers.authorization,
    )
  }

  @Version('1')
  @Post('tenants/:tenantId/users')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'Add a user to a CSTAR tenant as a SERVICE_USER (admin only)' })
  @ApiCreatedResponse({ type: CstarTenantUserDto })
  addTenantUser(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: AddCstarTenantUserDto,
    @Req() req: express.Request,
  ): Promise<CstarTenantUserDto> {
    return this.cstarApiClient.addTenantUser(tenantId, dto.user, req.headers.authorization)
  }

  @Version('1')
  @Delete('tenants/:tenantId/users/:tenantUserId')
  @HttpCode(204)
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({
    summary: 'Remove a SERVICE_USER-only user from a CSTAR tenant (admin only)',
  })
  @ApiNoContentResponse()
  removeTenantUser(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('tenantUserId', ParseUUIDPipe) tenantUserId: string,
    @Req() req: express.Request,
  ): Promise<void> {
    return this.cstarApiClient.removeTenantUser(tenantId, tenantUserId, req.headers.authorization)
  }

  @Version('1')
  @Get('tenants/:tenantId/users/:tenantUserId/roles')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: "A CSTAR tenant user's tenant roles (admin only)" })
  @ApiOkResponse({ type: [CstarTenantRoleDto] })
  getTenantUserRoles(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('tenantUserId', ParseUUIDPipe) tenantUserId: string,
    @Req() req: express.Request,
  ): Promise<CstarTenantRoleDto[]> {
    return this.cstarApiClient.getTenantUserRoles(tenantId, tenantUserId, req.headers.authorization)
  }

  @Version('1')
  @Get('users/search/idir')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'Search BC Gov SSO for IDIR users (admin only)' })
  @ApiOkResponse({ type: [CstarSsoSearchUserDto] })
  searchIdirUsers(
    @Query() query: CstarIdirSearchQueryDto,
    @Req() req: express.Request,
  ): Promise<CstarSsoSearchUserDto[]> {
    return this.cstarApiClient.searchIdirUsers({ ...query }, req.headers.authorization)
  }

  @Version('1')
  @Get('users/search/bceid')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'Search BC Gov SSO for Business BCeID users (admin only)' })
  @ApiOkResponse({ type: [CstarSsoSearchUserDto] })
  searchBceidUsers(
    @Query() query: CstarBceidSearchQueryDto,
    @Req() req: express.Request,
  ): Promise<CstarSsoSearchUserDto[]> {
    return this.cstarApiClient.searchBceidUsers({ ...query }, req.headers.authorization)
  }
}
