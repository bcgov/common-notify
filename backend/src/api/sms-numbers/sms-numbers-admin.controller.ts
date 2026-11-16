import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  Version,
} from '@nestjs/common'
import type { Request } from 'express'
import {
  ApiBearerAuth,
  ApiExcludeController,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { Roles } from '../../common/decorators/roles.decorator'
import { NotifyAdminGuard } from '../../common/guards/notify-admin.guard'
import { JwtUserExtractor } from '../../common/utils/jwt-user-extractor'
import { SsoRole } from '../../enum/sso-role.enum'
import { SearchableListQueryDto } from '../../common/query/searchable-list-query.dto'
import { parseListQuery } from '../../common/query/list-query.parser'
import { SmsNumberRequestsService } from './sms-number-requests.service'
import { SmsNumberActor, SmsNumbersService } from './sms-numbers.service'
import {
  ApproveSmsNumberRequestDto,
  AssignSmsNumberDto,
  CreateSmsNumberDto,
  PaginatedSmsNumberRequestsDto,
  smsNumberRequestListQueryConfig,
  RejectSmsNumberRequestDto,
  SmsNumberCodesDto,
  SmsNumberDto,
  SmsNumberRequestDto,
  UpdateSmsNumberDto,
} from './schemas/sms-number.dto'

const actorOf = (req: Request): SmsNumberActor => ({
  id: JwtUserExtractor.extractUser(req),
  name: JwtUserExtractor.extractDisplayName(req),
})

/**
 * The SMS number inventory, tenant assignments and request decisions. Admin-only (NOTIFY_ADMIN),
 * not tenant-scoped.
 */
@ApiTags('sms-numbers')
// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
@Controller('frontend/admin/sms-numbers')
@UseGuards(NotifyAdminGuard)
@Roles(SsoRole.NOTIFY_ADMIN)
@ApiBearerAuth()
export class SmsNumbersAdminController {
  constructor(
    private readonly smsNumbersService: SmsNumbersService,
    private readonly requestsService: SmsNumberRequestsService,
  ) {}

  @Version('1')
  @Get()
  @ApiOperation({ summary: 'Every SMS number, with the tenants assigned each' })
  @ApiOkResponse({ type: [SmsNumberDto] })
  listNumbers(): Promise<SmsNumberDto[]> {
    return this.smsNumbersService.listNumbers()
  }

  @Version('1')
  @Get('codes')
  @ApiOperation({
    summary: 'Providers, number types and request statuses, and the active provider',
  })
  @ApiOkResponse({ type: SmsNumberCodesDto })
  getCodes(): Promise<SmsNumberCodesDto> {
    return this.smsNumbersService.getCodes()
  }

  @Version('1')
  @Post()
  @ApiOperation({ summary: 'Add a number to the inventory' })
  @ApiOkResponse({ type: SmsNumberDto })
  createNumber(@Req() req: Request, @Body() dto: CreateSmsNumberDto): Promise<SmsNumberDto> {
    return this.smsNumbersService.createNumber(dto, actorOf(req))
  }

  @Version('1')
  @Patch(':id')
  @ApiOperation({ summary: "Update a number's type or description" })
  @ApiOkResponse({ type: SmsNumberDto })
  updateNumber(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSmsNumberDto,
  ): Promise<SmsNumberDto> {
    return this.smsNumbersService.updateNumber(id, dto, actorOf(req))
  }

  @Version('1')
  @Put(':id/default')
  @ApiOperation({ summary: "Make a number its provider's default, replacing the previous one" })
  @ApiOkResponse({ type: SmsNumberDto })
  setDefault(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string): Promise<SmsNumberDto> {
    return this.smsNumbersService.setDefault(id, actorOf(req))
  }

  @Version('1')
  @Delete(':id/default')
  @ApiOperation({ summary: "Stop using a number as its provider's default" })
  @ApiOkResponse({ type: SmsNumberDto })
  clearDefault(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string): Promise<SmsNumberDto> {
    return this.smsNumbersService.clearDefault(id, actorOf(req))
  }

  @Version('1')
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a number that no tenant is assigned' })
  @ApiNoContentResponse()
  deleteNumber(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.smsNumbersService.deleteNumber(id, actorOf(req))
  }

  @Version('1')
  @Put('tenants/:tenantId')
  @HttpCode(204)
  @ApiOperation({
    summary: "Assign a tenant a number, replacing its number for that number's provider",
  })
  @ApiNoContentResponse()
  async assign(
    @Req() req: Request,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: AssignSmsNumberDto,
  ): Promise<void> {
    await this.smsNumbersService.assign(tenantId, dto.smsNumberId, actorOf(req))
  }

  @Version('1')
  @Delete('tenants/:tenantId/:smsNumberId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unassign a number from a tenant' })
  @ApiNoContentResponse()
  unassign(
    @Req() req: Request,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('smsNumberId', ParseUUIDPipe) smsNumberId: string,
  ): Promise<void> {
    return this.smsNumbersService.unassign(tenantId, smsNumberId, actorOf(req))
  }

  @Version('1')
  @Get('requests')
  @ApiOperation({
    summary: "A page of tenants' SMS number requests, newest first, by status and tenant name",
  })
  @ApiOkResponse({ type: PaginatedSmsNumberRequestsDto })
  listRequests(@Query() query: SearchableListQueryDto): Promise<PaginatedSmsNumberRequestsDto> {
    const { page, limit, filters } = parseListQuery(query, smsNumberRequestListQueryConfig)
    const statuses = filters
      .filter((filter) => filter.field === 'statusCode')
      .flatMap((filter) => (Array.isArray(filter.value) ? filter.value : [filter.value]))
      .map(String)
    return this.requestsService.list({ statuses, search: query.search, page, limit })
  }

  @Version('1')
  @Post('requests/:id/approve')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Approve a request by assigning the tenant a number, or the default one outside prod',
  })
  @ApiOkResponse({ type: SmsNumberRequestDto })
  approve(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveSmsNumberRequestDto,
  ): Promise<SmsNumberRequestDto> {
    return this.requestsService.approve(
      id,
      dto.useDefaultNumber ? null : (dto.smsNumberId ?? null),
      actorOf(req),
    )
  }

  @Version('1')
  @Post('requests/:id/release')
  @HttpCode(200)
  @ApiOperation({ summary: 'Release the number an approved request assigned its tenant' })
  @ApiOkResponse({ type: SmsNumberRequestDto })
  release(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SmsNumberRequestDto> {
    return this.requestsService.release(id, actorOf(req))
  }

  @Version('1')
  @Post('requests/:id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a request, with a reason shown to the tenant' })
  @ApiOkResponse({ type: SmsNumberRequestDto })
  reject(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectSmsNumberRequestDto,
  ): Promise<SmsNumberRequestDto> {
    return this.requestsService.reject(id, dto.reason, actorOf(req))
  }
}
