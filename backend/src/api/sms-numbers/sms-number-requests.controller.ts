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
import { Roles } from '../../common/decorators/roles.decorator'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { JwtUserExtractor } from '../../common/utils/jwt-user-extractor'
import { CstarRole } from '../../enum/cstar-role.enum'
import type { Tenant } from '../admin/tenants/entities/tenant.entity'
import { SmsNumberRequestsService } from './sms-number-requests.service'
import { SmsNumbersService } from './sms-numbers.service'
import { SmsNumberRequestDto, TenantSmsNumberRequestResponseDto } from './schemas/sms-number.dto'

type TenantRequest = Request & { tenant: Tenant }

const actorOf = (req: Request) => ({
  id: JwtUserExtractor.extractUser(req),
  name: JwtUserExtractor.extractDisplayName(req),
})

/**
 * A tenant's own SMS number request: ask for a number, see where the request stands, cancel it
 * while pending, and release the number once assigned. Tenants cannot assign numbers; a Notify admin does.
 */
@ApiTags('sms-number-requests')
// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
@Controller('frontend/sms-number-requests')
@UseGuards(NotifyFrontendRoleGuard)
@ApiBearerAuth()
export class SmsNumberRequestsController {
  constructor(
    private readonly requestsService: SmsNumberRequestsService,
    private readonly smsNumbersService: SmsNumbersService,
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
  async getLatest(@Req() req: TenantRequest): Promise<TenantSmsNumberRequestResponseDto> {
    const [request, senderNumber] = await Promise.all([
      this.requestsService.findLatestForTenant(req.tenant.id),
      this.smsNumbersService.resolveSenderNumber(req.tenant.id),
    ])
    // The same rule that lets an admin approve onto the default number: every environment but prod.
    return {
      request,
      senderNumber,
      testEnvironment: this.smsNumbersService.defaultNumberAssignable(),
    }
  }

  @Version('1')
  @Post()
  @Roles(CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'Request an SMS number for the tenant' })
  @ApiCreatedResponse({ type: SmsNumberRequestDto })
  create(@Req() req: TenantRequest): Promise<SmsNumberRequestDto> {
    return this.requestsService.create(req.tenant.id, actorOf(req))
  }

  @Version('1')
  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: "Cancel the tenant's pending SMS number request" })
  @ApiOkResponse({ type: SmsNumberRequestDto })
  cancel(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SmsNumberRequestDto> {
    return this.requestsService.cancel(req.tenant.id, id, actorOf(req))
  }

  @Version('1')
  @Post(':id/release')
  @HttpCode(200)
  @Roles(CstarRole.NOTIFY_OPERATIONS_ADMIN)
  @ApiOperation({ summary: 'Release the number an approved request assigned the tenant' })
  @ApiOkResponse({ type: SmsNumberRequestDto })
  release(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SmsNumberRequestDto> {
    return this.requestsService.release(id, actorOf(req), req.tenant.id)
  }
}
