import {
  Controller,
  Get,
  Version,
  Logger,
  Query,
  Req,
  Request,
  Sse,
  UseGuards,
  Param,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { NotificationService } from './notification.service'
import {
  NotificationRequestDetailService,
  notificationRequestDetailListQueryConfig,
} from './notification-request-detail.service'
import { PaginatedNotificationResponse } from './schemas/paginated-response'
import { NotificationRequestDto } from './schemas/notification-request'
import { PaginatedNotificationRequestDetailResponse } from './schemas/paginated-request-detail-response'
import { NotificationRequestDetailListQueryDto } from './schemas/notification-request-detail-list-query.dto'
import { parseListQuery } from '../../common/query/list-query.parser'
import { Roles } from '../../common/decorators/roles.decorator'
import { CstarRole as CstarRoleEnum } from '../../enum/cstar-role.enum'
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator'
import { interval, map, merge, Observable } from 'rxjs'
import { NotificationPubSubService } from './notification-pubsub.service'
import type { Tenant } from '../admin/tenants/entities/tenant.entity'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'
import { FeatureFlagCode } from '../../enum/feature-flag-code.enum'
import { ListQueryDto } from '../../common/query/list-query.dto'

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
    private readonly notificationRequestDetailService: NotificationRequestDetailService,
    private readonly notificationPubSubService: NotificationPubSubService,
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
  @Sse('events')
  @UseGuards(NotifyFrontendRoleGuard, FeatureFlagGuard)
  @Roles(
    CstarRoleEnum.NOTIFY_VIEWER,
    CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR,
    CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN,
  )
  @FeatureFlag(FeatureFlagCode.SSE_NOTIFICATIONS)
  @ApiOperation({ summary: 'Stream real-time notification request updates via SSE' })
  @ApiOkResponse({
    description: 'Server-sent stream of notification_request updates for the authenticated tenant',
  })
  async streamEvents(@Req() req: Request): Promise<Observable<MessageEvent>> {
    const tenant = (req as any).tenant as Tenant

    // Observable stream — emits a refresh signal so the frontend refetches data
    const updates$ = this.notificationPubSubService
      .getObservable(tenant.id)
      .pipe(map(() => ({ data: {} }) as MessageEvent))

    // Emit a named keepalive event every 25s to prevent proxy/LB idle-connection timeouts.
    // The frontend's onmessage handler ignores events with type 'keepalive'.
    const keepalive$ = interval(25_000).pipe(
      map(() => ({ type: 'keepalive', data: '' }) as MessageEvent),
    )

    return merge(updates$, keepalive$)
  }

  @Version('1')
  @Get('request_details/:id')
  @ApiOperation({ summary: 'List notification request detail records for a notification request' })
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
    example: ['status:in:sent|failed', 'channel:eq:EMAIL'],
    description: 'Filters using field:operator:value. Repeat query param for multiple filters.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    example: 'example@gov.bc.ca',
    description: 'Case-insensitive search across recipient address.',
  })
  @ApiOkResponse({ type: PaginatedNotificationRequestDetailResponse })
  findRequestDetails(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: NotificationRequestDetailListQueryDto,
  ) {
    const frontendUser = (req as any).tenant as Tenant
    const parsedQuery = parseListQuery(query, notificationRequestDetailListQueryConfig)
    return this.notificationRequestDetailService.findByRequestIdFrontend(
      id,
      frontendUser.externalId,
      parsedQuery,
      query.search,
    )
  }

  @Version('1')
  @Get(':id')
  @Roles(
    CstarRoleEnum.NOTIFY_VIEWER,
    CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR,
    CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN,
  )
  @ApiOperation({ summary: 'Get a single notification request by id for the authenticated tenant' })
  @ApiOkResponse({ type: NotificationRequestDto })
  findOne(@Req() req: Request, @Param('id') id: string) {
    const tenant = (req as any).tenant as Tenant
    return this.notificationService.findOneFrontend(id, tenant.externalId)
  }
}
