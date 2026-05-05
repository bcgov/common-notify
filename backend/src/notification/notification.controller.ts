import {
  Controller,
  Get,
  Version,
  UseGuards,
  Logger,
  Query,
  Sse,
  MessageEvent,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { Observable, merge, interval } from 'rxjs'
import { map } from 'rxjs'
import { NotificationService } from './notification.service'
import { NotificationPubSubService } from './notification-pubsub.service'
import { PaginatedNotificationResponse } from './schemas'
import { AuthJwtGuard } from 'src/auth/guards/auth.jwt-guard'
import { RoleGuard } from 'src/common/guards/role.guard'
import { RequireRole } from 'src/auth/decorators/require-role.decorator'

@ApiTags('notification_request')
@Controller('notification_request')
@UseGuards(AuthJwtGuard, RoleGuard)
@ApiBearerAuth()
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name)

  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationPubSubService: NotificationPubSubService,
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
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1
    const limitNum = limit ? parseInt(limit, 10) : 10
    return this.notificationService.findAll(pageNum, limitNum, status)
  }

  @Version('1')
  @Sse('events')
  @RequireRole('NOTIFY_ADMIN')
  @ApiOperation({ summary: 'Stream real-time notification request updates via SSE' })
  @ApiOkResponse({
    description: 'Server-sent stream of notification_request updates for the authenticated tenant',
  })
  streamEvents(): Observable<MessageEvent> {
    // TODO: replace hardcoded tenantId with @GetTenant() once TenantGuard is wired in
    const tenantId = 'bfa12621-67f2-4f77-b9be-a4168f7bd1ab'

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
