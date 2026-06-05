import { Controller, Get, Version, UseGuards, Logger, Query, Req, Request } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { NotificationService } from './notification.service'
import { PaginatedNotificationResponse } from './schemas/paginated-response'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { SsoRole as SsoRoleEnum } from '../../enum/sso-role.enum'
import type { Tenant } from '../admin/tenants/entities/tenant.entity'

@ApiTags('notification_request')
@Controller('notification_request')
@UseGuards(NotifyFrontendRoleGuard)
@ApiBearerAuth()
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name)

  constructor(private readonly notificationService: NotificationService) {}

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
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by notification status',
  })
  @ApiOkResponse({ type: PaginatedNotificationResponse })
  findAll(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const tenant = (req as any).tenant as Tenant
    const pageNum = page ? parseInt(page, 10) : 1
    const limitNum = limit ? parseInt(limit, 10) : 10
    return this.notificationService.findAll(tenant.externalId, pageNum, limitNum, status)
  }
}
