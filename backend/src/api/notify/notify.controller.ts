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
  BadRequestException,
  Logger,
  Request,
  Req,
} from '@nestjs/common'
import Bull from 'bull'
import { JwtGuard } from '../../auth/guards/auth.jwt-guard'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'
import { SmsChannelFeatureFlagGuard } from '../../common/guards/sms-channel-feature-flag.guard'
import { TenantContextGuard } from '../../common/guards/auth.guard'
import { TenantGuard } from '../../common/guards/tenant.guard'
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { NotifyService } from './notify.service'
import { NotifySimpleRequest } from './schemas/notify-simple-request'
import { NotificationAcceptanceResponse } from './schemas/notification-acceptance-response.dto'
import {
  CancelNotificationDto,
  RescheduleNotificationDto,
} from './schemas/cancel-or-reschedule.dto'
import { Queueable } from '../../common/decorators/queueable.decorator'
import { QueueName } from '../../enum/queue-name.enum'
import { FeatureFlagCode } from '../../enum/feature-flag-code.enum'
import { NotificationService } from '../notification/notification.service'
import { NotificationRequestDto } from '../notification/schemas/notification-request'
import { Roles } from '../../common/decorators/roles.decorator'
import { CstarRoleGuard } from '../../common/guards/cstar-role.guard'
import { CstarRole as CstarRoleEnum } from '../../enum/cstar-role.enum'

// Note: All endpoints except NotifySimpleController.simpleSend are
// placeholders and return 501 Not Implemented. This is intentional to allow incremental
// implementation and testing of the simple send flow first, which is the current priority.
//
// Anything requiring queueing should use the @Queueable decorator and implement the method with an
// empty body (the decorator will handle the logic).
//
// Uses TenantGuard (not JwtGuard) to support Kong service-to-service calls that send HS256-signed JWTs.
// TenantGuard manually decodes the JWT without signature validation, allowing both Kong (HS256) and
// Keycloak (RS256) JWTs to work.
@Controller('notifysimple')
@UseGuards(TenantGuard, CstarRoleGuard)
export class NotifySimpleController {
  private readonly queueMap: Map<QueueName, Bull.Queue>

  constructor(
    private readonly notifyService: NotifyService,
    private readonly notificationService: NotificationService,
    @Inject(QueueName.INGESTION) private readonly ingestionQueue: Bull.Queue,
  ) {
    this.queueMap = new Map([[QueueName.INGESTION, this.ingestionQueue]])
  }

  @Version('1')
  @Post()
  @HttpCode(202)
  @UseGuards(SmsChannelFeatureFlagGuard)
  @Roles(CstarRoleEnum.NOTIFY_VIEWER)
  @Queueable(QueueName.INGESTION)
  simpleSend(
    @Req() req: any,
    @Body() _body: NotifySimpleRequest,
  ): Promise<NotificationAcceptanceResponse> {
    // Validation of templateId XOR content is handled by @ValidateTemplateOrContent() decorator on DTO
    // Implementation provided by @Queueable decorator
    return undefined as any
  }

  @Version('1')
  @Post('email')
  @HttpCode(202)
  @Roles(CstarRoleEnum.NOTIFY_VIEWER)
  @Queueable(QueueName.INGESTION)
  simpleSendEmail(
    @Req() req: any,
    @Body() _body: NotifySimpleRequest,
  ): Promise<NotificationAcceptanceResponse> {
    // Validation of templateId XOR content is handled by @ValidateTemplateOrContent() decorator on DTO
    // Implementation provided by @Queueable decorator
    return undefined as any
  }

  @Version('1')
  @Post('sms')
  @HttpCode(202)
  @UseGuards(FeatureFlagGuard)
  @FeatureFlag(FeatureFlagCode.SMS_NOTIFICATIONS)
  @Roles(CstarRoleEnum.NOTIFY_VIEWER)
  @Queueable(QueueName.INGESTION)
  simpleSendSms(
    @Req() req: any,
    @Body() _body: NotifySimpleRequest,
  ): Promise<NotificationAcceptanceResponse> {
    // Validation of templateId XOR content is handled by @ValidateTemplateOrContent() decorator on DTO
    // Implementation provided by @Queueable decorator
    return undefined as any
  }

  @Version('1')
  @Patch(':notificationId')
  @HttpCode(200)
  @Roles(CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  async cancelOrRescheduleNotification(
    @Req() req: Request,
    @Param('notificationId') notificationId: string,
    @Body() body: CancelNotificationDto | RescheduleNotificationDto,
  ): Promise<NotificationRequestDto> {
    const tenant = (req as any).tenant as Tenant
    return this.doCancelOrReschedule(
      tenant.id,
      tenant.id, // For service-to-service, use tenantId as updatedBy
      notificationId,
      body,
    )
  }

  private async doCancelOrReschedule(
    tenantId: string,
    updatedBy: string,
    notificationId: string,
    body: CancelNotificationDto | RescheduleNotificationDto,
  ): Promise<NotificationRequestDto> {
    const logger = new Logger(NotifySimpleController.name)

    try {
      // Determine action and scheduledTime from body
      const action = (body as any).action
      const scheduledTime = (body as any).scheduledTime

      // Validate that one of action or scheduledTime is provided
      if (!action && !scheduledTime) {
        throw new BadRequestException(
          "Either 'action' (set to 'cancel') or 'scheduledTime' must be provided",
        )
      }

      if (action && action !== 'cancel') {
        throw new BadRequestException("Action must be 'cancel' if provided")
      }

      // Update the notification in the database
      const updated = await this.notificationService.cancelOrRescheduleNotification(
        notificationId,
        tenantId,
        updatedBy,
        action as 'cancel',
        scheduledTime,
      )

      // If cancelling, attempt to remove from queue (non-fatal if it fails)
      if (action === 'cancel') {
        try {
          const jobs = await this.ingestionQueue.getJobs(['delayed', 'waiting'])
          const jobToRemove = jobs.find((job) => job.data?.notificationId === notificationId)

          if (jobToRemove) {
            await jobToRemove.remove()
            logger.log(`Removed job from queue for cancelled notification: ${notificationId}`, {
              tenantId,
              jobId: jobToRemove.id,
            })
          }
        } catch (error) {
          logger.error(
            `Failed to remove job from queue for notification ${notificationId}: ${error}`,
            { tenantId },
          )
        }
      } else if (scheduledTime) {
        // If rescheduling, attempt to update the job delay (non-fatal if it fails)
        try {
          const newDelay = new Date(scheduledTime).getTime() - Date.now()

          const jobs = await this.ingestionQueue.getJobs(['delayed', 'waiting'])
          const jobToUpdate = jobs.find((job) => job.data?.notificationId === notificationId)

          if (jobToUpdate) {
            await jobToUpdate.remove()
            await this.ingestionQueue.add(jobToUpdate.data, {
              delay: Math.max(0, newDelay),
              jobId: `${tenantId}-${notificationId}`,
              attempts: jobToUpdate.opts.attempts,
              backoff: jobToUpdate.opts.backoff,
            })
            logger.log(`Updated queue job delay for rescheduled notification: ${notificationId}`, {
              tenantId,
              newDelay,
            })
          }
        } catch (error) {
          logger.error(`Failed to update queue job for notification ${notificationId}: ${error}`, {
            tenantId,
          })
        }
      }

      // Return the updated notification DTO
      return {
        id: updated.id,
        tenantId: updated.tenantId,
        status: updated.status,
        channelCode: updated.channelCode,
        channel: updated.channel
          ? {
              channelCode: updated.channel.channelCode,
              displayName: updated.channel.displayName,
              description: updated.channel.description,
            }
          : undefined,
        recipients: updated.recipients,
        delayedSendTime: updated.delayedSendTime,
        payload: updated.payload,
        createdAt: updated.createdAt,
        createdBy: updated.createdBy,
        updatedAt: updated.updatedAt,
        updatedBy: updated.updatedBy,
        errorReason: updated.errorReason,
        tenant: updated.tenant
          ? {
              id: updated.tenant.id,
              name: updated.tenant.name,
              slug: updated.tenant.slug,
            }
          : undefined,
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error
      }

      logger.error(`Error in cancelOrRescheduleNotification: ${error}`, {
        tenantId,
        notificationId,
      })
      throw new BadRequestException(error instanceof Error ? error.message : String(error))
    }
  }
}

/**
 * Frontend Notification Simple API Controller
 *
 * ARCHITECTURAL NOTE: This controller is separate from NotifySimpleController
 * because the API Gateway requires separate routing:
 * - NotifySimpleController: /api/v1/notifysimple (service-to-service auth)
 * - NotifySimpleFrontendController: /api/v1/frontend/notifysimple (frontend auth)
 *
 * The different route prefixes enable the gateway to apply different authentication
 * rules based on client type (internal service vs frontend application).
 * Both controllers delegate to the same service for consistency.
 */
@Controller('frontend/notifysimple')
@UseGuards(CstarRoleGuard)
export class NotifySimpleFrontendController {
  private readonly queueMap: Map<QueueName, Bull.Queue>

  constructor(
    private readonly notifyService: NotifyService,
    private readonly notificationService: NotificationService,
    @Inject(QueueName.INGESTION) private readonly ingestionQueue: Bull.Queue,
  ) {
    this.queueMap = new Map([[QueueName.INGESTION, this.ingestionQueue]])
  }

  @Version('1')
  @Patch(':notificationId')
  @HttpCode(200)
  @Roles(CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN)
  async cancelOrRescheduleNotification(
    @Request() req: any,
    @Param('notificationId') notificationId: string,
    @Body() body: CancelNotificationDto | RescheduleNotificationDto,
  ): Promise<NotificationRequestDto> {
    // Extract tenantId and userId from JWT token
    const tenantId = req.user?.tenantId
    const userId = req.user?.sub // 'sub' is the standard JWT claim for user ID

    if (!tenantId) {
      throw new BadRequestException('Tenant ID not found in token')
    }

    if (!userId) {
      throw new BadRequestException('User ID not found in token')
    }

    // Use the shared logic from NotifySimpleController
    const simpleController = new NotifySimpleController(
      this.notifyService,
      this.notificationService,
      this.ingestionQueue,
    )
    return (simpleController as any).doCancelOrReschedule(tenantId, userId, notificationId, body)
  }
}

@Controller('notifyevent')
@UseGuards(JwtGuard)
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
@UseGuards(JwtGuard)
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
@UseGuards(JwtGuard)
export class ChesEmailController {
  constructor(private readonly notifyService: NotifyService) {}

  @Post()
  @HttpCode(501)
  chesEmail(@Body() _body: any) {
    return this.notifyService.notImplemented()
  }
}
