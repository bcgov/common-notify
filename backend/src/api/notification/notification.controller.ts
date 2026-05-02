import { Controller, Get, Version, UseGuards, Logger, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { NotificationService } from './notification.service'
import { PaginatedNotificationResponse } from './schemas/paginated-response'
import { AuthJwtGuard } from 'src/auth/guards/auth.jwt-guard'
import { RoleGuard } from 'src/common/guards/role.guard'
import { RequireRole } from 'src/auth/decorators/require-role.decorator'

@ApiTags('notification_request')
@Controller('notification_request')
@UseGuards(AuthJwtGuard, RoleGuard)
@ApiBearerAuth()
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name)

  constructor(private readonly notificationService: NotificationService) {}

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
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1
    const limitNum = limit ? parseInt(limit, 10) : 10
    return this.notificationService.findAll(pageNum, limitNum, status)
  }
}
