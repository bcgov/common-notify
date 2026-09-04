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
  ApiBody,
  ApiExcludeController,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger'
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
@ApiTags('Send')
@ApiSecurity('api-key')
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
  @ApiOperation({
    summary: 'Send a notification',
    description:
      'Accepts a notification for delivery on one or more channels and returns immediately with a ' +
      'notifyId; delivery happens asynchronously, so a 202 means accepted, not sent. Track the ' +
      'outcome with GET /api/v1/notification_request/{id}/request_details.\n\n' +
      'Supply at least one channel (`email`, `sms` or `msgApp`). Within a channel, give either a ' +
      '`content.templateId` or inline `content` - not both. Top-level `params` apply to every ' +
      "channel and are overridden by a channel's own `params`.",
  })
  @ApiBody({
    type: NotifySimpleRequest,
    examples: {
      inline: {
        summary: 'Email with inline content',
        value: {
          email: {
            recipients: { to: ['citizen@example.com'] },
            content: {
              subject: 'Your permit application',
              body: '<p>Hello {{firstName}}, your application has been received.</p>',
              bodyType: 'html',
              renderer: 'handlebars',
            },
          },
          params: { firstName: 'Alice' },
        },
      },
      template: {
        summary: 'Email from a stored template',
        value: {
          email: {
            recipients: { to: ['citizen@example.com'], cc: ['caseworker@example.com'] },
            content: { templateId: '3f1a7c2e-9b45-4d10-8e21-6c0f5a9b7d33' },
          },
          params: { firstName: 'Alice', permitNumber: 'BC-2026-00417' },
        },
      },
      multiChannel: {
        summary: 'Email and SMS in one request',
        value: {
          email: {
            recipients: { to: ['citizen@example.com'] },
            content: { subject: 'Appointment reminder', body: 'See you tomorrow at 09:00.' },
          },
          sms: {
            recipients: { to: ['+12505550123'] },
            content: { body: 'Reminder: your appointment is tomorrow at 09:00.' },
          },
        },
      },
      scheduled: {
        summary: 'Scheduled for later delivery',
        value: {
          email: {
            recipients: { to: ['citizen@example.com'] },
            content: { subject: 'Renewal due', body: 'Your permit expires next week.' },
            delayedSend: '2026-06-01T16:00:00Z',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 202,
    description: 'Accepted for delivery. The notifyId identifies this request from here on.',
    type: NotificationAcceptanceResponse,
  })
  @ApiResponse({ status: 400, description: 'Malformed request, or no channel supplied.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 403, description: 'The API key is not bound to the requested tenant.' })
  @ApiResponse({
    status: 422,
    description:
      'The request is well formed but cannot be accepted - for example both a templateId and ' +
      'inline content, an unknown templateId, or a recipient blocked by the safelist.',
  })
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
  @ApiOperation({
    summary: 'Send an email',
    description:
      'Email-only shorthand for POST /api/v1/notifysimple: the body is the email channel object ' +
      'itself rather than being nested under `email`. Use `recipients.mergeArray` to send a ' +
      'personalised message per row in one request (mail merge).',
  })
  @ApiBody({
    type: NotifyEmailChannel,
    examples: {
      simple: {
        summary: 'One message to several recipients',
        value: {
          recipients: { to: ['citizen@example.com'], bcc: ['records@example.com'] },
          content: {
            subject: 'Your permit application',
            body: '<p>Your application has been received.</p>',
            bodyType: 'html',
          },
        },
      },
      mailMerge: {
        summary: 'Mail merge - one personalised message per row',
        description:
          'The first row is the header and must contain a "to" column. Every other column ' +
          'becomes a template parameter for that recipient only.',
        value: {
          recipients: {
            mergeArray: [
              ['to', 'firstName', 'permitNumber'],
              ['alice@example.com', 'Alice', 'BC-2026-00417'],
              ['bob@example.com', 'Bob', 'BC-2026-00418'],
            ],
          },
          content: {
            subject: 'Permit {{permitNumber}}',
            body: '<p>Hello {{firstName}}, permit {{permitNumber}} is ready.</p>',
            bodyType: 'html',
            renderer: 'handlebars',
          },
        },
      },
      withAttachment: {
        summary: 'With an attachment',
        value: {
          recipients: { to: ['citizen@example.com'] },
          content: { subject: 'Your permit', body: 'The permit is attached.' },
          attachments: [
            {
              filename: 'permit.pdf',
              mimeType: 'application/pdf',
              content: 'JVBERi0xLjQKJcfsj6IK...',
            },
          ],
        },
      },
    },
  })
  @ApiResponse({
    status: 202,
    description:
      'Accepted for delivery. For a mail merge, recipientCount reports how many recipients were ' +
      'accepted.',
    type: NotificationAcceptanceResponse,
  })
  @ApiResponse({ status: 400, description: 'Malformed request.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 422, description: 'Valid JSON that cannot be accepted; see the message.' })
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
  @ApiOperation({
    summary: 'Send an SMS',
    description:
      'Sends the `sms` channel of the request. Recipient numbers are normalised to E.164, so ' +
      '"250 555 0123" and "+12505550123" are equivalent. Long messages are split into multiple ' +
      'segments and billed per segment.\n\n' +
      'Requires the `sms_notifications` feature flag for the tenant; without it this returns 404.',
  })
  @ApiBody({
    type: NotifySimpleRequest,
    examples: {
      sms: {
        summary: 'Plain SMS',
        value: {
          sms: {
            recipients: { to: ['+12505550123'] },
            content: { body: 'Your appointment is confirmed for 09:00 tomorrow.' },
          },
        },
      },
      templated: {
        summary: 'SMS from a template',
        value: {
          sms: {
            recipients: { to: ['+12505550123', '2505550124'] },
            content: { templateId: '3f1a7c2e-9b45-4d10-8e21-6c0f5a9b7d33' },
          },
          params: { appointmentTime: '09:00' },
        },
      },
    },
  })
  @ApiResponse({
    status: 202,
    description: 'Accepted for delivery.',
    type: NotificationAcceptanceResponse,
  })
  @ApiResponse({ status: 400, description: 'Malformed request, or an unusable phone number.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 404, description: 'SMS is not enabled for this tenant.' })
  @UseGuards(FeatureFlagGuard)
  @FeatureFlag(FeatureFlagCode.SMS_NOTIFICATIONS)
  @Queueable(QueueName.INGESTION)
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
  @ApiOperation({
    summary: 'Cancel or reschedule a scheduled notification',
    description:
      'Only a notification that has not been sent yet can be changed. Send `{"action":"cancel"}` ' +
      'to cancel it, or `{"scheduledTime":"..."}` with a future timestamp to move it. A request ' +
      'that has already been picked up for delivery returns 422.',
  })
  @ApiParam({
    name: 'notificationId',
    format: 'uuid',
    description: 'The notifyId returned when the notification was accepted.',
    example: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  })
  @ApiBody({
    schema: {
      oneOf: [
        { $ref: '#/components/schemas/CancelNotificationDto' },
        { $ref: '#/components/schemas/RescheduleNotificationDto' },
      ],
    },
    examples: {
      cancel: { summary: 'Cancel', value: { action: 'cancel' } },
      reschedule: { summary: 'Reschedule', value: { scheduledTime: '2026-06-01T16:00:00Z' } },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'The updated notification request.',
    type: NotificationRequestDto,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 404, description: 'No such notification for this tenant.' })
  @ApiResponse({ status: 422, description: 'Already sent, or the new time is in the past.' })
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
// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
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

@ApiTags('Webhooks')
@ApiSecurity('api-key')
@Controller('notify')
@UseGuards(NotifyServiceGuard)
export class NotifyController {
  constructor(private readonly webhookService: WebhookService) {}

  @Version('1')
  @Post('registerCallback')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Register a delivery webhook',
    description:
      'Registers a URL that Notify calls when a notification changes state, so you do not have to ' +
      'poll for status. Deliveries are retried with exponential backoff. If a signing secret is ' +
      'supplied it is used to sign each call, letting you verify the request came from Notify.',
  })
  @ApiResponse({
    status: 201,
    description: 'The registered callback.',
    type: CallbackRegistrationResponse,
  })
  @ApiResponse({ status: 400, description: 'Malformed request, or an unreachable URL.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
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
  @ApiOperation({
    summary: 'Update a registered webhook',
    description:
      'Changes the URL, the events subscribed to, the signing secret, or its enabled state.',
  })
  @ApiParam({
    name: 'callbackId',
    format: 'uuid',
    description: 'ID returned when the webhook was registered.',
  })
  @ApiResponse({
    status: 200,
    description: 'The updated callback.',
    type: CallbackRegistrationResponse,
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 404, description: 'No such callback for this tenant.' })
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
  @ApiOperation({
    summary: 'Delete a registered webhook',
    description: 'Stops delivery callbacks for this tenant. Notifications are unaffected.',
  })
  @ApiParam({
    name: 'callbackId',
    format: 'uuid',
    description: 'ID returned when the webhook was registered.',
  })
  @ApiResponse({ status: 204, description: 'Deleted.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key.' })
  @ApiResponse({ status: 404, description: 'No such callback for this tenant.' })
  deleteCallback(@Req() _req: any, @Param('callbackId') callbackId: string): Promise<void> {
    const tenantId = _req?.tenant?.id || null
    if (!tenantId) {
      throw new BadRequestException('Tenant ID not found')
    }
    return this.webhookService.delete(tenantId, callbackId)
  }
}

// Not part of the service API; kept out of the published spec.
@ApiExcludeController()
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
