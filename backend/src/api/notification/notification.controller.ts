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
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { NotificationService } from './notification.service'
import { NotificationRequestDetailService } from './notification-request-detail.service'
import { PaginatedNotificationResponse } from './schemas/paginated-response'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { SsoRole as SsoRoleEnum } from '../../enum/sso-role.enum'
import type { Tenant } from '../admin/tenants/entities/tenant.entity'
import { ListQueryDto } from '../../common/query/list-query.dto'

@ApiTags('notification_request')
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
  @ApiOperation({ summary: 'List all notification requests for the authenticated tenant' })
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
    summary: 'List all notification request detail records for the authenticated tenant',
  })
  findAllDeliveries(@Req() req: Request) {
    const tenant = (req as any).tenant as Tenant
    return this.notificationRequestDetailService.findAllByTenantId(tenant.id)
  }

  @Version('1')
  @Get(':id/request_details')
  @Roles(SsoRoleEnum.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'List notification request detail records for a notification request' })
  findDeliveries(@Req() req: Request, @Param('id') id: string) {
    const tenant = (req as any).tenant as Tenant
    return this.notificationRequestDetailService.findByRequestId(id, tenant.id)
  }
}
