import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  Version,
} from '@nestjs/common'
import type { Request } from 'express'
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { DataSource } from 'typeorm'
import { Roles } from '../../common/decorators/roles.decorator'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { CstarRole } from '../../enum/cstar-role.enum'
import type { Tenant } from '../admin/tenants/entities/tenant.entity'
import { actorOf } from '../tenant-requests/request-actor'
import { TenantRequestsService } from '../tenant-requests/tenant-requests.service'
import type { TenantRequestDto } from '../tenant-requests/schemas/tenant-request.dto'
import { SMS_NUMBER_REQUEST_TYPE } from './sms-number-codes'
import { SmsNumberRequestHandler } from './sms-number-request.handler'
import { SmsNumbersService } from './sms-numbers.service'
import { SmsNumberRequestDto, TenantSmsNumberRequestResponseDto } from './schemas/sms-number.dto'

type TenantScopedRequest = Request & { tenant: Tenant }

/**
 * A tenant's own SMS number request: ask for a number, see where the request stands, cancel it
 * while pending, and release the number once assigned. Tenants cannot assign numbers; a Notify
 * admin approves the request from the tenant requests page.
 */
@ApiTags('sms-number-requests')
// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
@Controller('frontend/sms-number-requests')
@UseGuards(NotifyFrontendRoleGuard)
@ApiBearerAuth()
export class SmsNumberRequestsController {
  constructor(
    private readonly requestsService: TenantRequestsService,
    private readonly handler: SmsNumberRequestHandler,
    private readonly smsNumbersService: SmsNumbersService,
    private readonly dataSource: DataSource,
  ) {}

  @Version('1')
  @Get()
  @Roles(
    CstarRole.NOTIFY_VIEWER,
    CstarRole.NOTIFY_TEMPLATE_EDITOR,
    CstarRole.NOTIFY_OPERATIONS_ADMIN,
  )
  @ApiOperation({
    summary: "The tenant's most recent SMS number request, and the number it sends from now",
  })
  @ApiOkResponse({ type: TenantSmsNumberRequestResponseDto })
  async getLatest(@Req() req: TenantScopedRequest): Promise<TenantSmsNumberRequestResponseDto> {
    const [request, senderNumber] = await Promise.all([
      this.requestsService.findLatestForTenant(req.tenant.id, SMS_NUMBER_REQUEST_TYPE),
      this.smsNumbersService.resolveSenderNumber(req.tenant.id),
    ])
    // The same rule that lets an admin approve onto the default number: every environment but prod.
    return {
      request: await this.toSmsDto(request),
      senderNumber,
      testEnvironment: this.smsNumbersService.defaultNumberAssignable(),
    }
  }

  @Version('1')
  @Post()
  @Roles(CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'Request an SMS number for the tenant' })
  @ApiCreatedResponse({ type: SmsNumberRequestDto })
  async create(@Req() req: TenantScopedRequest): Promise<SmsNumberRequestDto | null> {
    return this.toSmsDto(
      await this.requestsService.create(req.tenant.id, SMS_NUMBER_REQUEST_TYPE, actorOf(req)),
    )
  }

  @Version('1')
  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: "Cancel the tenant's pending SMS number request" })
  @ApiOkResponse({ type: SmsNumberRequestDto })
  async cancel(
    @Req() req: TenantScopedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SmsNumberRequestDto | null> {
    return this.toSmsDto(
      await this.requestsService.cancel(req.tenant.id, id, actorOf(req), SMS_NUMBER_REQUEST_TYPE),
    )
  }

  @Version('1')
  @Post(':id/release')
  @HttpCode(200)
  @Roles(CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'Release the number an approved request assigned the tenant' })
  @ApiOkResponse({ type: SmsNumberRequestDto })
  async release(
    @Req() req: TenantScopedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SmsNumberRequestDto | null> {
    return this.toSmsDto(
      await this.requestsService.release(id, actorOf(req), {
        tenantId: req.tenant.id,
        type: SMS_NUMBER_REQUEST_TYPE,
      }),
    )
  }

  private toSmsDto(request: TenantRequestDto | null): Promise<SmsNumberRequestDto | null> {
    return this.handler.toSmsDto(this.dataSource.manager, request)
  }
}
