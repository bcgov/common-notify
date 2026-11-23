import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { CstarTenantAdminGuard } from './cstar-tenant-admin.guard'
import { Roles } from '../../../common/decorators/roles.decorator'
import { CstarRole } from '../../../enum/cstar-role.enum'
import { SsoRole } from '../../../enum/sso-role.enum'
import { CstarApiClient } from '../../../services/cstar/cstar-api.client'
import {
  CstarGroupDetailDto,
  CstarGroupDto,
  CstarGroupSharedServiceDto,
  CstarGroupUserDto,
  CstarHealthDto,
  CstarSharedServiceDto,
  CstarSsoSearchUserDto,
  CstarTenantDetailDto,
  CstarTenantRoleDto,
  CstarTenantUserDto,
  CstarUserGroupDto,
} from '../../../services/cstar/schemas/cstar.schema'
import { AddCstarTenantUserDto } from './schemas/add-cstar-tenant-user.dto'
import {
  AddCstarGroupUserDto,
  CreateCstarGroupDto,
  UpdateCstarGroupDto,
  UpdateCstarGroupRolesDto,
} from './schemas/cstar-group.dto'
import { CstarTenantQueryDto, CstarTenantUserQueryDto } from './schemas/cstar-tenant-user-query.dto'
import {
  CstarBceidSearchQueryDto,
  CstarIdirSearchQueryDto,
} from './schemas/cstar-user-search-query.dto'

/**
 * Manage the users and groups of a CSTAR tenant on CSTAR's behalf.
 *
 * Route: /api/v1/frontend/admin/cstar
 * Guarded by CstarTenantAdminGuard: a NOTIFY_ADMIN (SSO role) may manage any tenant, and a
 * NOTIFY_OPERATIONS_ADMIN may manage the tenant they hold it in (the :tenantId in the path, or
 * x-tenant-id for user search). Health is NOTIFY_ADMIN only. The caller's own token is passed
 * through, which CSTAR accepts as a headless shared service token when the caller is IDIR and
 * the tenant uses Notify. CSTAR enforces the rest, and its refusals are passed back.
 */
@ApiTags('admin-cstar')
// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
@Controller('frontend/admin/cstar')
@UseGuards(CstarTenantAdminGuard)
@ApiBearerAuth()
export class CstarTenantAdminController {
  constructor(private readonly cstarApiClient: CstarApiClient) {}

  @Version('1')
  @Get('tenants/:tenantId/users')
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
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
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
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
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
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
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
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
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
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
  @Get('health')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: "CSTAR's health check (admin only)" })
  @ApiOkResponse({ type: CstarHealthDto })
  getHealth(): Promise<CstarHealthDto> {
    return this.cstarApiClient.getHealth()
  }

  @Version('1')
  @Get('tenants/:tenantId')
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'A CSTAR tenant (admin only)' })
  @ApiOkResponse({ type: CstarTenantDetailDto })
  getTenant(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query() query: CstarTenantQueryDto,
    @Req() req: express.Request,
  ): Promise<CstarTenantDetailDto> {
    return this.cstarApiClient.getTenant(tenantId, query.expand, req.headers.authorization)
  }

  @Version('1')
  @Get('tenants/:tenantId/shared-services')
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'The shared services a CSTAR tenant uses (admin only)' })
  @ApiOkResponse({ type: [CstarSharedServiceDto] })
  getTenantSharedServices(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Req() req: express.Request,
  ): Promise<CstarSharedServiceDto[]> {
    return this.cstarApiClient.getTenantSharedServices(tenantId, req.headers.authorization)
  }

  @Version('1')
  @Get('tenants/:tenantId/ssousers/:ssoUserId/roles')
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: "An SSO user's tenant roles in a CSTAR tenant (admin only)" })
  @ApiOkResponse({ type: [CstarTenantRoleDto] })
  getSsoUserTenantRoles(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('ssoUserId') ssoUserId: string,
    @Req() req: express.Request,
  ): Promise<CstarTenantRoleDto[]> {
    return this.cstarApiClient.getSsoUserTenantRoles(tenantId, ssoUserId, req.headers.authorization)
  }

  @Version('1')
  @Get('tenants/:tenantId/ssousers/:ssoUserId/groups')
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({
    summary: "An SSO user's groups that grant Notify roles, with those roles (admin only)",
  })
  @ApiOkResponse({ type: [CstarUserGroupDto] })
  getUserGroupsWithRoles(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('ssoUserId') ssoUserId: string,
    @Req() req: express.Request,
  ): Promise<CstarUserGroupDto[]> {
    return this.cstarApiClient.getUserGroupsWithRoles(
      tenantId,
      ssoUserId,
      req.headers.authorization,
    )
  }

  @Version('1')
  @Get('users/search/idir')
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
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
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'Search BC Gov SSO for Business BCeID users (admin only)' })
  @ApiOkResponse({ type: [CstarSsoSearchUserDto] })
  searchBceidUsers(
    @Query() query: CstarBceidSearchQueryDto,
    @Req() req: express.Request,
  ): Promise<CstarSsoSearchUserDto[]> {
    return this.cstarApiClient.searchBceidUsers({ ...query }, req.headers.authorization)
  }

  @Version('1')
  @Get('tenants/:tenantId/groups')
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: "List a CSTAR tenant's groups (admin only)" })
  @ApiOkResponse({ type: [CstarGroupDto] })
  listGroups(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Req() req: express.Request,
  ): Promise<CstarGroupDto[]> {
    return this.cstarApiClient.getTenantGroups(tenantId, req.headers.authorization)
  }

  @Version('1')
  @Get('tenants/:tenantId/groups/:groupId')
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'A CSTAR group with its members (admin only)' })
  @ApiOkResponse({ type: CstarGroupDetailDto })
  getGroup(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Req() req: express.Request,
  ): Promise<CstarGroupDetailDto> {
    return this.cstarApiClient.getGroup(tenantId, groupId, req.headers.authorization)
  }

  @Version('1')
  @Post('tenants/:tenantId/groups')
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'Create a group in a CSTAR tenant (admin only)' })
  @ApiCreatedResponse({ type: CstarGroupDto })
  createGroup(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CreateCstarGroupDto,
    @Req() req: express.Request,
  ): Promise<CstarGroupDto> {
    return this.cstarApiClient.createGroup(tenantId, { ...dto }, req.headers.authorization)
  }

  @Version('1')
  @Put('tenants/:tenantId/groups/:groupId')
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: "Change a CSTAR group's name or description (admin only)" })
  @ApiOkResponse({ type: CstarGroupDto })
  updateGroup(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateCstarGroupDto,
    @Req() req: express.Request,
  ): Promise<CstarGroupDto> {
    return this.cstarApiClient.updateGroup(tenantId, groupId, { ...dto }, req.headers.authorization)
  }

  @Version('1')
  @Post('tenants/:tenantId/groups/:groupId/users')
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'Add a user to a CSTAR group (admin only)' })
  @ApiCreatedResponse({ type: CstarGroupUserDto })
  addGroupUser(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: AddCstarGroupUserDto,
    @Req() req: express.Request,
  ): Promise<CstarGroupUserDto> {
    return this.cstarApiClient.addGroupUser(
      tenantId,
      groupId,
      dto.user,
      dto.confirmOtherServices,
      req.headers.authorization,
    )
  }

  @Version('1')
  @Delete('tenants/:tenantId/groups/:groupId/users/:groupUserId')
  @HttpCode(204)
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'Remove a user from a CSTAR group (admin only)' })
  @ApiNoContentResponse()
  removeGroupUser(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('groupUserId', ParseUUIDPipe) groupUserId: string,
    @Req() req: express.Request,
  ): Promise<void> {
    return this.cstarApiClient.removeGroupUser(
      tenantId,
      groupId,
      groupUserId,
      req.headers.authorization,
    )
  }

  @Version('1')
  @Get('tenants/:tenantId/groups/:groupId/roles')
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'The shared service roles a CSTAR group grants (admin only)' })
  @ApiOkResponse({ type: [CstarGroupSharedServiceDto] })
  getGroupRoles(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Req() req: express.Request,
  ): Promise<CstarGroupSharedServiceDto[]> {
    return this.cstarApiClient.getGroupRoles(tenantId, groupId, req.headers.authorization)
  }

  @Version('1')
  @Put('tenants/:tenantId/groups/:groupId/roles')
  @Roles(SsoRole.NOTIFY_ADMIN, CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: "Switch a CSTAR group's Notify roles on or off (admin only)" })
  @ApiOkResponse({ type: [CstarGroupSharedServiceDto] })
  updateGroupRoles(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateCstarGroupRolesDto,
    @Req() req: express.Request,
  ): Promise<CstarGroupSharedServiceDto[]> {
    return this.cstarApiClient.updateGroupRoles(
      tenantId,
      groupId,
      { sharedServices: dto.sharedServices },
      req.headers.authorization,
    )
  }
}
