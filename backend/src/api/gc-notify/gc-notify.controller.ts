import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseFilters,
  UnprocessableEntityException,
} from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiHeader,
  ApiExtraModels,
} from '@nestjs/swagger'
import * as express from 'express'
import { GcNotifyApiClient } from './gc-notify-api.client'
import { CreateEmailNotificationRequest } from './schemas/create-email-notification-request'
import { CreateSmsNotificationRequest } from './schemas/create-sms-notification-request'
import { NotificationResponse } from './schemas/notification-response'
import { Notification } from './schemas/notification'
import { Template } from './schemas/template'
import { PostBulkRequest } from './schemas/post-bulk-request'
import { PostBulkResponse } from './schemas/post-bulk-response'
import { EmailContent } from './schemas/email-content'
import { SmsContent } from './schemas/sms-content'
import { NotificationsListResponse } from './schemas/notifications-list-response'
import { TemplatesListResponse } from './schemas/templates-list-response'
import { FileAttachment } from './schemas/file-attachment'
import { GcNotifyServiceGuard } from '../../common/guards/gc-notify-service.guard'
import { GcNotifyExceptionFilter } from './gc-notify-exception.filter'
import { GcNotifyRoutingService } from './gc-notify-routing.service'
import { GcNotifyInternalExecutionService } from './gc-notify-internal-execution.service'
import { FeatureFlagCode } from '../../enum/feature-flag-code.enum'
import { extractRequestRoute } from '../../common/utils/extract-request-route'
import { GcNotifyBulkValidationService } from './gc-notify-bulk-validation.service'

interface GcNotifyRequest extends express.Request {
  gcNotifyAuthHeader: string
  tenantId: string
  tenantExternalId: string
}

@ApiTags('GC Notify')
@ApiExtraModels(EmailContent, SmsContent, FileAttachment)
@UseGuards(GcNotifyServiceGuard)
@UseFilters(GcNotifyExceptionFilter)
@Controller('gcnotify/v2')
export class GcNotifyController {
  constructor(
    private readonly gcNotifyApiClient: GcNotifyApiClient,
    private readonly gcNotifyRoutingService: GcNotifyRoutingService,
    private readonly gcNotifyInternalExecutionService: GcNotifyInternalExecutionService,
    private readonly gcNotifyBulkValidationService: GcNotifyBulkValidationService,
  ) {}

  @Get('notifications')
  @ApiOperation({ summary: 'Get list of notifications' })
  @ApiHeader({
    name: 'Authorization',
    required: true,
    description: 'API key in format: ApiKey-v1 {api-key}',
    example: 'ApiKey-v1 your-api-key-here',
  })
  @ApiQuery({ name: 'template_type', required: false, enum: ['sms', 'email'] })
  @ApiQuery({
    name: 'status',
    required: false,
    schema: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['created', 'in-transit', 'pending', 'sent', 'delivered', 'failed'],
      },
    },
  })
  @ApiQuery({ name: 'reference', required: false })
  @ApiQuery({ name: 'older_than', required: false, description: 'UUID' })
  @ApiQuery({ name: 'include_jobs', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved notifications',
    type: NotificationsListResponse,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getNotifications(
    @Req() req: GcNotifyRequest,
    @Query('template_type') templateType?: 'sms' | 'email',
    @Query('status') status?: string | string[],
    @Query('reference') reference?: string,
    @Query('older_than') olderThan?: string,
    @Query('include_jobs') includeJobs?: boolean,
  ) {
    const statusArray = Array.isArray(status) ? status : status ? [status] : undefined
    const query = {
      template_type: templateType,
      status: statusArray,
      reference,
      older_than: olderThan,
      include_jobs: includeJobs,
    }

    const useInternal = await this.gcNotifyRoutingService.shouldExecuteInternally(
      FeatureFlagCode.GC_NOTIFY_ROUTE_LIST_NOTIFICATIONS,
      req.tenantId,
    )
    return useInternal
      ? this.gcNotifyInternalExecutionService.getNotifications(
          query,
          req.tenantId,
          req.tenantExternalId,
        )
      : this.gcNotifyApiClient.getNotifications(query, req.gcNotifyAuthHeader)
  }

  @Post('notifications/email')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send an email notification' })
  @ApiHeader({
    name: 'Authorization',
    required: true,
    description: 'API key in format: ApiKey-v1 {api-key}',
    example: 'ApiKey-v1 your-api-key-here',
  })
  @ApiResponse({
    status: 201,
    description: 'Email notification created successfully',
    type: NotificationResponse,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async sendEmail(@Body() body: CreateEmailNotificationRequest, @Req() req: GcNotifyRequest) {
    const useInternal = await this.gcNotifyRoutingService.shouldExecuteInternally(
      FeatureFlagCode.GC_NOTIFY_ROUTE_EMAIL,
      req.tenantId,
    )
    return useInternal
      ? this.gcNotifyInternalExecutionService.sendEmail(
          body,
          req.tenantId,
          extractRequestRoute(req),
        )
      : this.gcNotifyApiClient.sendEmail(body, req.gcNotifyAuthHeader)
  }

  @Post('notifications/sms')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send an SMS notification' })
  @ApiHeader({
    name: 'Authorization',
    required: true,
    description: 'API key in format: ApiKey-v1 {api-key}',
    example: 'ApiKey-v1 your-api-key-here',
  })
  @ApiResponse({
    status: 201,
    description: 'SMS notification created successfully',
    type: NotificationResponse,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async sendSms(@Body() body: CreateSmsNotificationRequest, @Req() req: GcNotifyRequest) {
    const useInternal = await this.gcNotifyRoutingService.shouldExecuteInternally(
      FeatureFlagCode.GC_NOTIFY_ROUTE_SMS,
      req.tenantId,
    )
    return useInternal
      ? this.gcNotifyInternalExecutionService.sendSms(body, req.tenantId, extractRequestRoute(req))
      : this.gcNotifyApiClient.sendSms(body, req.gcNotifyAuthHeader)
  }

  @Post('notifications/bulk')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a batch of notifications' })
  @ApiHeader({
    name: 'Authorization',
    required: true,
    description: 'API key in format: ApiKey-v1 {api-key}',
    example: 'ApiKey-v1 your-api-key-here',
  })
  @ApiResponse({
    status: 201,
    description: 'Bulk job created successfully',
    type: PostBulkResponse,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async sendBulk(@Body() body: PostBulkRequest, @Req() req: GcNotifyRequest) {
    if (body.rows) {
      const validation = this.gcNotifyBulkValidationService.validateRows(body.rows)
      if (!validation.valid) {
        throw new UnprocessableEntityException({
          errors: validation.errors.map((message) => ({
            error: 'ValidationError',
            message,
          })),
        })
      }
    }

    // Bulk send is passthrough-only; a native mail-merge job runner is being built separately.
    return this.gcNotifyApiClient.sendBulk(body, req.gcNotifyAuthHeader)
  }

  @Get('notifications/:notificationId')
  @ApiOperation({ summary: 'Get notification by ID' })
  @ApiHeader({
    name: 'Authorization',
    required: true,
    description: 'API key in format: ApiKey-v1 {api-key}',
    example: 'ApiKey-v1 your-api-key-here',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification retrieved successfully',
    type: Notification,
  })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async getNotificationById(
    @Param('notificationId') notificationId: string,
    @Req() req: GcNotifyRequest,
  ) {
    const useInternal = await this.gcNotifyRoutingService.shouldExecuteInternally(
      FeatureFlagCode.GC_NOTIFY_ROUTE_GET_NOTIFICATION,
      req.tenantId,
    )
    return useInternal
      ? this.gcNotifyInternalExecutionService.getNotificationById(notificationId, req.tenantId)
      : this.gcNotifyApiClient.getNotificationById(notificationId, req.gcNotifyAuthHeader)
  }

  @Get('templates')
  @ApiOperation({ summary: 'Get list of templates' })
  @ApiQuery({ name: 'type', required: false, enum: ['sms', 'email'] })
  @ApiHeader({
    name: 'Authorization',
    required: true,
    description: 'API key in format: ApiKey-v1 {api-key}',
    example: 'ApiKey-v1 your-api-key-here',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved templates',
    type: TemplatesListResponse,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTemplates(@Query('type') type?: 'sms' | 'email', @Req() req?: GcNotifyRequest) {
    const useInternal = await this.gcNotifyRoutingService.shouldExecuteInternally(
      FeatureFlagCode.GC_NOTIFY_ROUTE_LIST_TEMPLATES,
      req!.tenantId,
    )
    return useInternal
      ? this.gcNotifyInternalExecutionService.getTemplates(type, req!.tenantId)
      : this.gcNotifyApiClient.getTemplates(type, req!.gcNotifyAuthHeader)
  }

  @Get('template/:templateId')
  @ApiOperation({ summary: 'Get template by ID' })
  @ApiHeader({
    name: 'Authorization',
    required: true,
    description: 'API key in format: ApiKey-v1 {api-key}',
    example: 'ApiKey-v1 your-api-key-here',
  })
  @ApiResponse({
    status: 200,
    description: 'Template retrieved successfully',
    type: Template,
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async getTemplate(@Param('templateId') templateId: string, @Req() req: GcNotifyRequest) {
    const useInternal = await this.gcNotifyRoutingService.shouldExecuteInternally(
      FeatureFlagCode.GC_NOTIFY_ROUTE_GET_TEMPLATE,
      req.tenantId,
    )
    return useInternal
      ? this.gcNotifyInternalExecutionService.getTemplate(templateId, req.tenantId)
      : this.gcNotifyApiClient.getTemplate(templateId, req.gcNotifyAuthHeader)
  }
}
