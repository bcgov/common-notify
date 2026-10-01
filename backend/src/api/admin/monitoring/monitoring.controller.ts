import { Controller, Get, MessageEvent, Sse, UseGuards, Version } from '@nestjs/common'
import { Observable, interval, map, merge } from 'rxjs'
import { ApiBearerAuth, ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger'
import { NotifyAdminGuard } from '../../../common/guards/notify-admin.guard'
import { Roles } from '../../../common/decorators/roles.decorator'
import { SsoRole } from '../../../enum/sso-role.enum'
import { MonitoringService } from './monitoring.service'
import { MonitoringEventsService } from './monitoring-events.service'
import type { QueueMonitoringResponseDto } from './schemas/queue-monitoring.dto'

const KEEPALIVE_MS = 25_000

/**
 * Admin monitoring of the Bull queues, their workers and Redis.
 *
 * Route: /api/v1/frontend/admin/monitoring
 * Guarded by NotifyAdminGuard + NOTIFY_ADMIN (SSO role); not tenant-scoped.
 */
@ApiTags('monitoring')
// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
@Controller('frontend/admin/monitoring')
@UseGuards(NotifyAdminGuard)
@ApiBearerAuth()
export class MonitoringController {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly monitoringEvents: MonitoringEventsService,
  ) {}

  @Version('1')
  @Get('queues')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'Queue, worker and Redis health (admin only)' })
  getQueues(): Promise<QueueMonitoringResponseDto> {
    return this.monitoringService.getQueueMonitoring()
  }

  /**
   * Emits `changed` when queue state moves (at most every 2s) so the page refetches /queues,
   * instead of polling it. A named keepalive every 25s stops proxies closing an idle stream.
   */
  @Version('1')
  @Sse('queues/events')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'Stream queue change signals for the monitoring page (admin only)' })
  streamQueueEvents(): Observable<MessageEvent> {
    const changes$ = this.monitoringEvents.changes$.pipe(
      map(() => ({ type: 'changed', data: '' }) as MessageEvent),
    )
    const keepalive$ = interval(KEEPALIVE_MS).pipe(
      map(() => ({ type: 'keepalive', data: '' }) as MessageEvent),
    )
    return merge(changes$, keepalive$)
  }
}
