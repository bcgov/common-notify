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
import { ApiOperation, ApiResponse } from '@nestjs/swagger'
import Bull from 'bull'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'
import { SmsChannelFeatureFlagGuard } from '../../common/guards/sms-channel-feature-flag.guard'
import { NotifyServiceGuard } from '../../common/guards/notify-service.guard'
import { NotifyFrontendRoleGuard } from '../../common/guards/notify-frontend-role.guard'
import { MailMergeUiLimitsGuard } from '../../common/guards/mail-merge-ui-limits.guard'
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator'
import { Tenant } from '../admin/tenants/entities/tenant.entity'
import { NotifyService } from './notify.service'
import { NotifySimpleRequest } from './schemas/notify-simple-request'
import { NotifyEmailChannel } from './schemas/notify-email-channel'
import { NotificationAcceptanceResponse } from './schemas/notification-acceptance-response.dto'
import { MAIL_MERGE_MAX_RECIPIENTS } from './schemas/mail-merge.constants'
import {
  CancelNotificationDto,
  RescheduleNotificationDto,
} from './schemas/cancel-or-reschedule.dto'
import { Queueable } from '../../common/decorators/queueable.decorator'
import { QueueName } from '../../enum/queue-name.enum'
import { NotificationChannel } from '../../enum/notification-channel.enum'
import { FeatureFlagCode } from '../../enum/feature-flag-code.enum'
import { NotificationService } from '../notification/notification.service'
import { NotificationRequestDetailService } from '../notification/notification-request-detail.service'
import { ApiKeyUsageService } from '../api-keys/api-key-usage.service'
import { AttachmentProcessingService } from './services/attachment-processing.service'
import { AttachmentValidationService } from './services/attachment-validation.service'
import { LimitAlertNotificationService } from './services/limit-alert-notification.service'
import { SafelistService } from '../safelist/safelist.service'
import { SmsSegmentService } from './services/sms-segment.service'
import { NotificationRequestDto } from '../notification/schemas/notification-request'
import { Roles } from '../../common/decorators/roles.decorator'
import { CstarRole as CstarRoleEnum } from '../../enum/cstar-role.enum'
import { WebhookService } from '../webhook/webhook.service'
import {
  CallbackRegistrationRequest,
  CallbackRegistrationResponse,
  CallbackRegistrationUpdateRequest,
} from '../webhook/schemas/callback-registration.dto'

// Note: All endpoints except NotifySimpleController.simpleSend are
// placeholders and return 501 Not Implemented. This is intentional to allow incremental
// implementation and testing of the simple send flow first, which is the current priority.
//
// Anything requiring queueing should use the @Queueable decorator and implement the method with an
// empty body (the decorator will handle the logic).
//
// Uses NotifyServiceGuard for service-to-service calls that require x-tenant-id header
// and valid client_id + tenant_id mapping in the database.
@Controller('notifysimple')
@UseGuards(NotifyServiceGuard)
export class NotifySimpleController {
  private readonly queueMap: Map<QueueName, Bull.Queue>

  constructor(
    private readonly notifyService: NotifyService,
    private readonly notificationService: NotificationService,
    readonly attachmentValidationService: AttachmentValidationService,
    readonly attachmentProcessingService: AttachmentProcessingService,
    readonly notificationRequestDetailService: NotificationRequestDetailService,
    readonly apiKeyUsageService: ApiKeyUsageService,
    readonly limitAlertNotificationService: LimitAlertNotificationService,
    readonly safelistService: SafelistService,
    readonly smsSegmentService: SmsSegmentService,
    @Inject(QueueName.INGESTION) private readonly ingestionQueue: Bull.Queue,
  ) {
    this.queueMap = new Map([[QueueName.INGESTION, this.ingestionQueue]])
  }

  @Version('1')
  @Post()
  @HttpCode(202)
  @UseGuards(SmsChannelFeatureFlagGuard)
  @Queueable(QueueName.INGESTION)
  simpleSend(
    @Req() _req: any,
    @Body() _body: NotifySimpleRequest,
  ): Promise<NotificationAcceptanceResponse> {
    // Validation of templateId XOR content is handled by @ValidateTemplateOrContent() decorator on DTO
    // Implementation provided by @Queueable decorator
    return undefined as any
  }

  @Version('1')
  @Post('email')
  @HttpCode(202)
  @Queueable(QueueName.INGESTION, NotificationChannel.EMAIL)
  simpleSendEmail(
    @Req() _req: any,
    @Body() _body: NotifyEmailChannel,
  ): Promise<NotificationAcceptanceResponse> {
    return undefined as any
  }

  @Version('1')
  @Post('sms')
  @HttpCode(202)
  @UseGuards(FeatureFlagGuard)
  @FeatureFlag(FeatureFlagCode.SMS_NOTIFICATIONS)
  @Queueable(QueueName.INGESTION)
  @ApiOperation({
    summary: 'Send an SMS notification, to one list of recipients or as a mail merge',
    description: [
      'Accepts an SMS send and returns immediately. Delivery happens asynchronously, so a 202 means',
      'the request was accepted and persisted - not that any message has been sent. Track delivery',
      'with the returned notifyId via GET /api/v1/notify/status/{notifyId}.',
      '',
      'Two shapes of send are supported, chosen by what `sms.recipients` contains:',
      '',
      '- `to`: a list of phone numbers. Every recipient receives the same body.',
      '- `mergeArray`: a mail merge. The first row is a header whose first column must be `to`;',
      "  every following row is one recipient, and the remaining columns become that recipient's",
      '  template params. Each recipient therefore receives a different message.',
      '',
      'Exactly one of the two must be present. Phone numbers may be given in any format that',
      'normalises to E.164 (Canadian numbers are assumed when no country code is supplied); a number',
      'that cannot be normalised is rejected with the row it appeared on.',
      '',
      'Billing note: SMS is charged in segments, and a body longer than a single segment is sent as',
      'several concatenated messages. For a merge, every row is rendered and costed individually, so',
      'the accepted request can consume more of the tenant allowance than it has recipients. The',
      'response reports both numbers.',
      '',
      `Limits: at most ${MAIL_MERGE_MAX_RECIPIENTS.toLocaleString()} recipients per merge. Daily and`,
      'annual send limits are enforced per API key before the request is accepted. This route is',
      'gated by the `sms_notifications` feature flag and returns 404 for a tenant without it.',
    ].join('\n'),
  })
  @ApiResponse({
    status: 202,
    description:
      'Request accepted for delivery. `recipientCount` is the number of accepted recipients; for a merge, `billableMessageCount` is the total SMS segments those recipients will consume.',
    type: NotificationAcceptanceResponse,
  })
  @ApiResponse({
    status: 400,
    description:
      'The request body failed validation - for example both `to` and `mergeArray` were supplied, a phone number could not be normalised to E.164, or a merge row had a different column count to its header.',
  })
  @ApiResponse({
    status: 404,
    description: 'The `sms_notifications` feature flag is not enabled for this tenant.',
  })
  @ApiResponse({
    status: 422,
    description:
      'The request was well-formed but its contents were rejected. The body carries an `errors` array naming each problem, row by row for a merge (missing number, invalid number, duplicate).',
  })
  @ApiResponse({
    status: 429,
    description: 'This send would exceed the daily or annual SMS limit for the calling API key.',
  })
  simpleSendSms(
    @Req() _req: any,
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
      return this.notificationService.mapToDto(updated)
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
@UseGuards(NotifyFrontendRoleGuard)
export class NotifySimpleFrontendController {
  private readonly queueMap: Map<QueueName, Bull.Queue>

  constructor(
    private readonly notifyService: NotifyService,
    private readonly notificationService: NotificationService,
    readonly attachmentValidationService: AttachmentValidationService,
    readonly attachmentProcessingService: AttachmentProcessingService,
    readonly notificationRequestDetailService: NotificationRequestDetailService,
    readonly apiKeyUsageService: ApiKeyUsageService,
    readonly limitAlertNotificationService: LimitAlertNotificationService,
    readonly safelistService: SafelistService,
    readonly smsSegmentService: SmsSegmentService,
    @Inject(QueueName.INGESTION) private readonly ingestionQueue: Bull.Queue,
  ) {
    this.queueMap = new Map([[QueueName.INGESTION, this.ingestionQueue]])
  }

  /**
   * Ad-hoc email send from the UI, used by the mail merge screen: the recipient list and the
   * per-recipient template values both come from `recipients.mergeArray`.
   *
   * The bare email-channel body is wrapped into a NotifySimpleRequest by @Queueable, so this shares
   * the merge validation, safelist filtering and fan-out with NotifySimpleController.simpleSendEmail.
   * Open to template editors as well as operations admins — the same pair as `canEdit` on the
   * frontend, which gates the Send button on the Bulk Notifications screen.
   *
   * Guarded by the same BULK_NOTIFICATIONS flag the frontend hides the screen behind, so a tenant
   * without the feature cannot reach the send by calling the API directly. FeatureFlagGuard is
   * listed first so a disabled tenant is refused before the row cap is even measured; it reads the
   * tenant from `request.tenant`, which the controller-level NotifyFrontendRoleGuard has already
   * set by the time route guards run.
   */
  @Version('1')
  @Post()
  @HttpCode(202)
  @Roles(CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN, CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR)
  @UseGuards(FeatureFlagGuard, MailMergeUiLimitsGuard)
  @FeatureFlag(FeatureFlagCode.BULK_NOTIFICATIONS)
  @Queueable(QueueName.INGESTION, NotificationChannel.EMAIL)
  sendEmail(
    @Req() _req: any,
    @Body() _body: NotifyEmailChannel,
  ): Promise<NotificationAcceptanceResponse> {
    // Implementation provided by @Queueable
    return undefined as any
  }

  /**
   * The SMS counterpart of sendEmail, gated on both flags: BULK_NOTIFICATIONS for the screen and
   * SMS_NOTIFICATIONS for the channel, so a tenant needs the channel as well as the feature.
   *
   * Takes a full NotifySimpleRequest rather than a bare channel body, matching the service SMS
   * route so the two request shapes stay identical.
   */
  @Version('1')
  @Post('sms')
  @HttpCode(202)
  @Roles(CstarRoleEnum.NOTIFY_OPERATIONS_ADMIN, CstarRoleEnum.NOTIFY_TEMPLATE_EDITOR)
  @UseGuards(FeatureFlagGuard, SmsChannelFeatureFlagGuard, MailMergeUiLimitsGuard)
  @FeatureFlag(FeatureFlagCode.BULK_NOTIFICATIONS)
  @Queueable(QueueName.INGESTION)
  sendSms(
    @Req() _req: any,
    @Body() _body: NotifySimpleRequest,
  ): Promise<NotificationAcceptanceResponse> {
    // Implementation provided by @Queueable
    return undefined as any
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
      this.attachmentValidationService,
      this.attachmentProcessingService,
      this.notificationRequestDetailService,
      this.apiKeyUsageService,
      this.limitAlertNotificationService,
      this.safelistService,
      this.smsSegmentService,
      this.ingestionQueue,
    )
    return (simpleController as any).doCancelOrReschedule(tenantId, userId, notificationId, body)
  }
}

@Controller('notifyevent')
@UseGuards(NotifyServiceGuard)
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
@UseGuards(NotifyServiceGuard)
export class NotifyController {
  constructor(
    private readonly notifyService: NotifyService,
    private readonly webhookService: WebhookService,
  ) {}

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
  @HttpCode(201)
  registerCallback(
    @Req() _req: any,
    @Body() body: CallbackRegistrationRequest,
  ): Promise<CallbackRegistrationResponse> {
    const tenantId = _req?.tenant?.id || null
    if (!tenantId) {
      throw new BadRequestException('Tenant ID not found')
    }
    return this.webhookService.create(tenantId, body)
  }

  @Version('1')
  @Patch('registerCallback/:callbackId')
  @HttpCode(200)
  updateCallback(
    @Req() _req: any,
    @Param('callbackId') callbackId: string,
    @Body() body: CallbackRegistrationUpdateRequest,
  ): Promise<CallbackRegistrationResponse> {
    const tenantId = _req?.tenant?.id || null
    if (!tenantId) {
      throw new BadRequestException('Tenant ID not found')
    }
    return this.webhookService.update(tenantId, callbackId, body)
  }

  @Version('1')
  @Delete('registerCallback/:callbackId')
  @HttpCode(204)
  deleteCallback(@Req() _req: any, @Param('callbackId') callbackId: string): Promise<void> {
    const tenantId = _req?.tenant?.id || null
    if (!tenantId) {
      throw new BadRequestException('Tenant ID not found')
    }
    return this.webhookService.delete(tenantId, callbackId)
  }
}

@Controller('ches/api/v1/email')
@UseGuards(NotifyServiceGuard)
export class ChesEmailController {
  constructor(private readonly notifyService: NotifyService) {}

  @Post()
  @HttpCode(501)
  chesEmail(@Body() _body: any) {
    return this.notifyService.notImplemented()
  }
}
