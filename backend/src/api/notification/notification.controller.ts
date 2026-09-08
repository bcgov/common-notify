import {
  Controller,
  Get,
  Version,
  UseGuards,
  Logger,
  Query,
  Req,
  Request,
  Param,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger'
import { NotificationService } from './notification.service'
import { NotificationRequestDetailService } from './notification-request-detail.service'
import { PaginatedNotificationResponse } from './schemas/paginated-response'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { SsoRole as SsoRoleEnum } from '../../enum/sso-role.enum'
import type { Tenant } from '../admin/tenants/entities/tenant.entity'
import { ListQueryDto } from '../../common/query/list-query.dto'

@ApiTags('Notification status')
@ApiSecurity('api-key')
@Controller('notification_request')
@UseGuards(NotifyFrontendRoleGuard)
@ApiBearerAuth()
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name)

  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationRequestDetailService: NotificationRequestDetailService,
  ) {}

  @Version('1')
  @Get()
  @Roles(SsoRoleEnum.NOTIFY_ADMIN)
  @ApiOperation({
    summary: 'List notification requests',
    description:
      'Returns the notifications submitted by this tenant with their current status, newest ' +
      'first. This is how you follow up a send: the notifyId returned by a send endpoint appears ' +
      'here as `id`.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Page number (1-indexed)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 10,
    description: 'Items per page (max 100)',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    type: String,
    example: '-createdAt,status',
    description: 'Sort fields separated by commas. Prefix with - for DESC.',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    type: String,
    isArray: true,
    example: ['status:eq:QUEUED', 'createdAt:gte:2026-01-01T00:00:00.000Z'],
    description: 'Filters using field:operator:value. Repeat query param for multiple filters.',
  })
  @ApiOkResponse({ type: PaginatedNotificationResponse })
  findAll(@Req() req: Request, @Query() query: ListQueryDto) {
    const tenant = (req as any).tenant as Tenant
    return this.notificationService.findAll(tenant.externalId, query)
  }

  @Version('1')
  @Get('request_details')
  @Roles(SsoRoleEnum.NOTIFY_ADMIN)
  @ApiOperation({
    summary: 'List delivery records',
    description:
      "Returns one record per recipient per channel across all of this tenant's notifications - " +
      'the per-recipient outcome behind each request, including provider status and any failure ' +
      'reason.',
  })
  @ApiOkResponse({
    description: 'Delivery records for the tenant.',
    schema: {
      example: [
        {
          id: '2b1f8d44-1c07-4e5a-9a1b-3f0e2d7c8a91',
          notificationRequestId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
          recipientAddress: 'citizen@example.com',
          channelCode: 'EMAIL',
          status: 'SENT',
          sentAt: '2026-05-15T10:00:04.512Z',
          errorReason: null,
        },
      ],
    },
  })
  @ApiResponse({ status: 403, description: 'Requires the NOTIFY_ADMIN role.' })
  findAllDeliveries(@Req() req: Request) {
    const tenant = (req as any).tenant as Tenant
    return this.notificationRequestDetailService.findAllByTenantId(tenant.id)
  }

  @Version('1')
  @Get(':id/request_details')
  @Roles(SsoRoleEnum.NOTIFY_ADMIN)
  @ApiOperation({
    summary: 'Get delivery records for one notification',
    description:
      'Returns the per-recipient outcome for a single notification: one record per recipient per ' +
      'channel, with the provider status and any failure reason. Use this to find out whether a ' +
      'particular address actually received the message.',
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    description: 'The notifyId returned when the notification was accepted.',
  })
  @ApiOkResponse({
    description: 'Delivery records for this notification.',
    schema: {
      example: [
        {
          id: '2b1f8d44-1c07-4e5a-9a1b-3f0e2d7c8a91',
          notificationRequestId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
          recipientAddress: 'citizen@example.com',
          channelCode: 'EMAIL',
          status: 'SENT',
          sentAt: '2026-05-15T10:00:04.512Z',
          errorReason: null,
        },
        {
          id: '9d4c2a70-6f31-49bb-8c02-15ab7e6f4d28',
          notificationRequestId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
          recipientAddress: '+12505550123',
          channelCode: 'SMS',
          status: 'FAILED',
          sentAt: null,
          errorReason: 'Unreachable destination handset',
        },
      ],
    },
  })
  @ApiResponse({ status: 403, description: 'Requires the NOTIFY_ADMIN role.' })
  @ApiResponse({ status: 404, description: 'No such notification for this tenant.' })
  findDeliveries(@Req() req: Request, @Param('id') id: string) {
    const tenant = (req as any).tenant as Tenant
    return this.notificationRequestDetailService.findByRequestId(id, tenant.id)
  }
}
