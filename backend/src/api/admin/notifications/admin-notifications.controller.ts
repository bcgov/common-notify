import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards, Version } from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiExcludeController,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import { NotifyAdminGuard } from '../../../common/guards/notify-admin.guard'
import { Roles } from '../../../common/decorators/roles.decorator'
import { SsoRole } from '../../../enum/sso-role.enum'
import { ListQueryDto } from '../../../common/query/list-query.dto'
import { AdminNotificationsService } from './admin-notifications.service'
import {
  AdminNotificationDetailDto,
  AdminNotificationQueryDto,
  PaginatedAdminDeliveryResponseDto,
  PaginatedAdminNotificationResponseDto,
} from './schemas/admin-notification.dto'

/**
 * Notification requests across every tenant, for troubleshooting a send.
 *
 * Route: /api/v1/frontend/admin/notifications
 * Guarded by NotifyAdminGuard + NOTIFY_ADMIN (SSO role); not tenant-scoped. Returns no recipient
 * addresses or message content.
 */
@ApiTags('admin-notifications')
// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
@Controller('frontend/admin/notifications')
@UseGuards(NotifyAdminGuard)
@ApiBearerAuth()
export class AdminNotificationsController {
  constructor(private readonly adminNotificationsService: AdminNotificationsService) {}

  @Version('1')
  @Get()
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'List notification requests across tenants (admin only)' })
  @ApiOkResponse({ type: PaginatedAdminNotificationResponseDto })
  list(@Query() query: AdminNotificationQueryDto): Promise<PaginatedAdminNotificationResponseDto> {
    return this.adminNotificationsService.list(query, query.search)
  }

  @Version('1')
  @Get(':id')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'A notification request, its status history and log link (admin only)' })
  @ApiOkResponse({ type: AdminNotificationDetailDto })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AdminNotificationDetailDto> {
    return this.adminNotificationsService.findOne(id)
  }

  @Version('1')
  @Get(':id/deliveries')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: "A request's deliveries, without recipient addresses (admin only)" })
  @ApiOkResponse({ type: PaginatedAdminDeliveryResponseDto })
  listDeliveries(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListQueryDto,
  ): Promise<PaginatedAdminDeliveryResponseDto> {
    return this.adminNotificationsService.listDeliveries(id, query)
  }
}
