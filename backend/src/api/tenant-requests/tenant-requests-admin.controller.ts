import {
  Body,
  Controller,
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
import type { Request } from 'express'
import {
  ApiBearerAuth,
  ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { Roles } from '../../common/decorators/roles.decorator'
import { NotifyAdminGuard } from '../../common/guards/notify-admin.guard'
import { SsoRole } from '../../enum/sso-role.enum'
import { SearchableListQueryDto } from '../../common/query/searchable-list-query.dto'
import { parseListQuery } from '../../common/query/list-query.parser'
import type { ListQueryFilter } from '../../common/query/list-query.types'
import { TenantRequestsService } from './tenant-requests.service'
import { actorOf } from './request-actor'
import {
  ApproveTenantRequestDto,
  PaginatedTenantRequestsDto,
  RejectTenantRequestDto,
  TenantRequestCodesDto,
  TenantRequestDto,
  tenantRequestListQueryConfig,
} from './schemas/tenant-request.dto'

/** The values filtered on for one field, from `field:in:a|b` or `field:eq:a`. */
const valuesOf = (filters: ListQueryFilter[], field: string): string[] =>
  filters
    .filter((filter) => filter.field === field)
    .flatMap((filter) => (Array.isArray(filter.value) ? filter.value : [filter.value]))
    .map(String)

/** Every tenant's requests, and the decisions on them. Admin-only (NOTIFY_ADMIN). */
@ApiTags('tenant-requests')
// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
@Controller('frontend/admin/tenant-requests')
@UseGuards(NotifyAdminGuard)
@Roles(SsoRole.NOTIFY_ADMIN)
@ApiBearerAuth()
export class TenantRequestsAdminController {
  constructor(private readonly requestsService: TenantRequestsService) {}

  @Version('1')
  @Get()
  @ApiOperation({
    summary: "A page of tenants' requests, newest first, by type, status and tenant name",
  })
  @ApiOkResponse({ type: PaginatedTenantRequestsDto })
  list(@Query() query: SearchableListQueryDto): Promise<PaginatedTenantRequestsDto> {
    const { page, limit, filters } = parseListQuery(query, tenantRequestListQueryConfig)
    return this.requestsService.list({
      statuses: valuesOf(filters, 'statusCode'),
      types: valuesOf(filters, 'requestTypeCode'),
      search: query.search,
      page,
      limit,
    })
  }

  @Version('1')
  @Get('codes')
  @ApiOperation({ summary: 'The request types and statuses, for filtering' })
  @ApiOkResponse({ type: TenantRequestCodesDto })
  getCodes(): Promise<TenantRequestCodesDto> {
    return this.requestsService.getCodes()
  }

  @Version('1')
  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a request, granting what it asked for' })
  @ApiOkResponse({ type: TenantRequestDto })
  approve(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveTenantRequestDto,
  ): Promise<TenantRequestDto> {
    return this.requestsService.approve(id, dto.options ?? {}, actorOf(req))
  }

  @Version('1')
  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a request, with a reason shown to the tenant' })
  @ApiOkResponse({ type: TenantRequestDto })
  reject(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectTenantRequestDto,
  ): Promise<TenantRequestDto> {
    return this.requestsService.reject(id, dto.reason, actorOf(req))
  }

  @Version('1')
  @Post(':id/release')
  @HttpCode(200)
  @ApiOperation({ summary: 'Take back what an approved request granted' })
  @ApiOkResponse({ type: TenantRequestDto })
  release(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string): Promise<TenantRequestDto> {
    return this.requestsService.release(id, actorOf(req))
  }
}
