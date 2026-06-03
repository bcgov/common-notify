import {
  Controller,
  Get,
  Version,
  Logger,
  Query,
  Sse,
  BadRequestException,
  UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { NotificationService } from './notification.service'
import { PaginatedNotificationResponse } from './schemas/paginated-response'
import { Roles } from '../../common/decorators/roles.decorator'
import { CstarRole as CstarRoleEnum } from '../../enum/cstar-role.enum'
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator'
import { interval, map, merge, Observable } from 'rxjs'
import { NotificationPubSubService } from './notification-pubsub.service'
import { TenantsService } from '../admin/tenants/tenants.service'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'
import { FeatureFlagCode } from '../../enum/feature-flag-code.enum'

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
@UseGuards(NotifyFrontendRoleGuard)
@ApiBearerAuth()
export class NotificationFrontendController {
  private readonly logger = new Logger(NotificationFrontendController.name)

  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationPubSubService: NotificationPubSubService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Version('1')
  @Get()
  @Roles(
    CstarRoleEnum.NOTIFY_VIEWER,
    CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR,
    CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN,
  )
  @ApiOperation({ summary: 'List all notification requests for the authenticated tenant' })
  @ApiQuery({
    name: 'tenantId',
    required: true,
    type: String,
    description: 'CSTAR external tenant ID to filter by',
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
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by notification status',
  })
  @ApiOkResponse({ type: PaginatedNotificationResponse })
  findAll(
    @Query('tenantId') tenantExternalId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1
    const limitNum = limit ? parseInt(limit, 10) : 10
    return this.notificationService.findAll(tenantExternalId, pageNum, limitNum, status)
  }

  @Version('1')
  @Sse('events')
  @UseGuards(NotifyFrontendRoleGuard, FeatureFlagGuard)
  @Roles(
    CstarRoleEnum.NOTIFY_VIEWER,
    CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR,
    CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN,
  )
  @FeatureFlag(FeatureFlagCode.SSE_NOTIFICATIONS)
  @ApiOperation({ summary: 'Stream real-time notification request updates via SSE' })
  @ApiQuery({
    name: 'tenantId',
    required: true,
    type: String,
    description: 'CSTAR external tenant ID to filter by',
  })
  @ApiOkResponse({
    description: 'Server-sent stream of notification_request updates for the authenticated tenant',
  })
  async streamEvents(
    @Query('tenantId') tenantExternalId: string,
  ): Promise<Observable<MessageEvent>> {
    // Convert external tenant ID to internal UUID
    const tenant = await this.tenantsService.findByExternalId(tenantExternalId)
    if (!tenant) {
      throw new BadRequestException(`Tenant not found: ${tenantExternalId}`)
    }

    const tenantId = tenant.id

    // Observable stream
    const updates$ = this.notificationPubSubService
      .getObservable(tenantId)
      .pipe(map((dto) => ({ data: dto }) as MessageEvent))

    // Emit a named keepalive event every 25s to prevent proxy/LB idle-connection timeouts.
    // The frontend's onmessage handler ignores events with type 'keepalive'.
    const keepalive$ = interval(25_000).pipe(
      map(() => ({ type: 'keepalive', data: '' }) as MessageEvent),
    )

    return merge(updates$, keepalive$)
  }
}
