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
import { SsoRole } from '../../enum/sso-role.enum'
import { actorOf } from '../tenant-requests/request-actor'
import { SmsNumbersService } from './sms-numbers.service'
import {
  AssignSmsNumberDto,
  CreateSmsNumberDto,
  SmsNumberCodesDto,
  SmsNumberDto,
  UpdateSmsNumberDto,
} from './schemas/sms-number.dto'

/**
 * The SMS number inventory and tenant assignments. Admin-only (NOTIFY_ADMIN), not tenant-scoped.
 * Requests for a number are decided through the tenant requests workflow.
 */
@ApiTags('sms-numbers')
// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
@Controller('frontend/admin/sms-numbers')
@UseGuards(NotifyAdminGuard)
@Roles(SsoRole.NOTIFY_ADMIN)
@ApiBearerAuth()
export class SmsNumbersAdminController {
  constructor(private readonly smsNumbersService: SmsNumbersService) {}

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
    summary: 'Providers and number types, and the active provider',
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
}
