import { Controller, Get, Version, Logger, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { NotificationService } from './notification.service'
import { PaginatedNotificationResponse } from './schemas/paginated-response'

/**
 * Frontend Notification API Controller
 *
 * ARCHITECTURAL NOTE: This controller intentionally duplicates methods from NotificationController
 * because the API Gateway requires separate routing:
 * - NotificationController: /api/v1/notification_request (service-to-service auth)
 * - NotificationFrontendController: /api/v1/frontend/notification_request (frontend auth)
 *
 * The different route prefixes enable the gateway to apply different authentication
 * rules based on client type (internal service vs frontend application).
 * Both controllers delegate to the same NotificationService for consistency.
 *
 * If the gateway configuration changes to support a single route with conditional auth,
 * these controllers can be consolidated.
 */
@ApiTags('notification_request')
@Controller('frontend/notification_request')
@ApiBearerAuth()
export class NotificationFrontendController {
  private readonly logger = new Logger(NotificationFrontendController.name)

  constructor(private readonly notificationService: NotificationService) {}

  @Version('1')
  @Get()
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
