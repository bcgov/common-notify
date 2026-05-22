import { Controller, Get, Version, UseGuards, Logger, Query, Param } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { NotificationService } from './notification.service'
import { NotificationRequestDetailService } from './notification-request-detail.service'
import { PaginatedNotificationResponse } from './schemas/paginated-response'
import { AuthJwtGuard } from '../../auth/guards/auth.jwt-guard'
import { RoleGuard } from '../../auth/guards/role.guard'
import { RequireRole } from '../../auth/decorators/require-role.decorator'
import { GetTenant } from '../../common/decorators/get-tenant.decorator'
import type { Tenant } from '../admin/tenants/entities/tenant.entity'

@ApiTags('notification_request')
@Controller('notification_request')
@UseGuards(AuthJwtGuard, RoleGuard)
@ApiBearerAuth()
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name)

  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationRequestDetailService: NotificationRequestDetailService,
  ) {}

  @Version('1')
  @Get()
  @RequireRole('NOTIFY_ADMIN')
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
    @GetTenant() tenant: Tenant,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1
    const limitNum = limit ? parseInt(limit, 10) : 10
    return this.notificationService.findAll(tenant.externalId, pageNum, limitNum, status)
  }

  @Version('1')
  @Get(':id/deliveries')
  @RequireRole('NOTIFY_ADMIN')
  @ApiOperation({ summary: 'List individual request detail records for a notification request' })
  findDeliveries(@Param('id') id: string) {
    return this.notificationRequestDetailService.findByRequestId(id)
  }
}
