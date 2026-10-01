import { Controller, Get, UseGuards, Version } from '@nestjs/common'
import { ApiBearerAuth, ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger'
import { NotifyAdminGuard } from '../../../common/guards/notify-admin.guard'
import { Roles } from '../../../common/decorators/roles.decorator'
import { SsoRole } from '../../../enum/sso-role.enum'
import { MonitoringService } from './monitoring.service'
import type { QueueMonitoringResponseDto } from './schemas/queue-monitoring.dto'

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
  constructor(private readonly monitoringService: MonitoringService) {}

  @Version('1')
  @Get('queues')
  @Roles(SsoRole.NOTIFY_ADMIN)
  @ApiOperation({ summary: 'Queue, worker and Redis health (admin only)' })
  getQueues(): Promise<QueueMonitoringResponseDto> {
    return this.monitoringService.getQueueMonitoring()
  }
}
