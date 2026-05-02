import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Param,
  Query,
  Body,
  HttpCode,
  Version,
  UseGuards,
  Inject,
} from '@nestjs/common'
import Bull from 'bull'
import { TenantGuard } from '../../common/guards/tenant.guard'
import { GetTenant } from '../../common/decorators/get-tenant.decorator'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { NotifyService } from './notify.service'
import { NotifySimpleRequest } from './schemas/notify-simple-request'
import { NotificationAcceptanceResponse } from './schemas/notification-acceptance-response.dto'
import { Queueable } from '../../common/decorators/queueable.decorator'
import { QueueName } from '../../enum/queue-name.enum'
import { NotificationService } from '../notification/notification.service'

// Note: All endpoints except NotifySimpleController.simpleSend are
// placeholders and return 501 Not Implemented. This is intentional to allow incremental
// implementation and testing of the simple send flow first, which is the current priority.
//
// Anything requiring queueing should use the @Queueable decorator and implement the method with an
// empty body (the decorator will handle the logic).
@Controller('notifysimple')
@UseGuards(TenantGuard)
export class NotifySimpleController {
  private readonly queueMap: Map<QueueName, Bull.Queue>

  constructor(
    private readonly notificationService: NotificationService,
    @Inject(QueueName.INGESTION) private readonly ingestionQueue: Bull.Queue,
  ) {
    this.queueMap = new Map([[QueueName.INGESTION, this.ingestionQueue]])
  }

  @Version('1')
  @Post()
  @HttpCode(202)
  @Queueable(QueueName.INGESTION)
  simpleSend(
    @GetTenant() _tenant: Tenant,
    @Body() _body: NotifySimpleRequest,
  ): Promise<NotificationAcceptanceResponse> {
    // Implementation provided by @Queueable decorator
    return undefined as any
  }

  @Version('1')
  @Post('email')
  @HttpCode(202)
  @Queueable(QueueName.INGESTION)
  simpleSendEmail(
    @GetTenant() _tenant: Tenant,
    @Body() _body: NotifySimpleRequest,
  ): Promise<NotificationAcceptanceResponse> {
    // Implementation provided by @Queueable decorator
    return undefined as any
  }

  @Version('1')
  @Post('sms')
  @HttpCode(202)
  @Queueable(QueueName.INGESTION)
  simpleSendSms(
    @GetTenant() _tenant: Tenant,
    @Body() _body: NotifySimpleRequest,
  ): Promise<NotificationAcceptanceResponse> {
    // Implementation provided by @Queueable decorator
    return undefined as any
  }
}

@Controller('notifyevent')
@UseGuards(TenantGuard)
export class NotifyEventController {
  constructor(private readonly notifyService: NotifyService) {}

  @Version('1')
  @Post()
  @HttpCode(501)
  eventTypeSend(@Body() _body: any) {
    return this.notifyService.notImplemented()
  }

  @Version('1')
  @Post('preview')
  @HttpCode(501)
  eventTypePreview(@Body() _body: any) {
    return this.notifyService.notImplemented()
  }

  @Version('1')
  @Get('types')
  @HttpCode(501)
  listEventTypes(@Query('limit') _limit?: string, @Query('cursor') _cursor?: string) {
    return this.notifyService.notImplemented()
  }

  @Version('1')
  @Get('types/:eventTypeId')
  @HttpCode(501)
  getEventType(@Param('eventTypeId') _eventTypeId: string) {
    return this.notifyService.notImplemented()
  }
}

@Controller('notify')
@UseGuards(TenantGuard)
export class NotifyController {
  constructor(private readonly notifyService: NotifyService) {}

  @Version('1')
  @Get()
  @HttpCode(501)
  listNotifications(
    @Query('limit') _limit?: string,
    @Query('cursor') _cursor?: string,
    @Query('status') _status?: string,
    @Query('startDate') _startDate?: string,
    @Query('endDate') _endDate?: string,
  ) {
    return this.notifyService.notImplemented()
  }

  @Version('1')
  @Delete()
  @HttpCode(501)
  cancelNotification(@Query('notifyId') _notifyId: string) {
    return this.notifyService.notImplemented()
  }

  @Version('1')
  @Get('status/:notifyId')
  @HttpCode(501)
  getNotificationStatus(@Param('notifyId') _notifyId: string) {
    return this.notifyService.notImplemented()
  }

  @Version('1')
  @Post('registerCallback')
  @HttpCode(501)
  registerCallback(@Body() _body: any) {
    return this.notifyService.notImplemented()
  }

  @Version('1')
  @Patch('registerCallback/:callbackId')
  @HttpCode(501)
  updateCallback(@Param('callbackId') _callbackId: string, @Body() _body: any) {
    return this.notifyService.notImplemented()
  }

  @Version('1')
  @Delete('registerCallback/:callbackId')
  @HttpCode(501)
  deleteCallback(@Param('callbackId') _callbackId: string) {
    return this.notifyService.notImplemented()
  }
}

@Controller('ches/api/v1/email')
@UseGuards(TenantGuard)
export class ChesEmailController {
  constructor(private readonly notifyService: NotifyService) {}

  @Post()
  @HttpCode(501)
  chesEmail(@Body() _body: any) {
    return this.notifyService.notImplemented()
  }
}
