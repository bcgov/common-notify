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
  BadRequestException,
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
import { ApiKeyGuard } from 'src/common/guards/api-key.guard'

@ApiTags('GC Notify')
@ApiExtraModels(EmailContent, SmsContent, FileAttachment)
@UseGuards(ApiKeyGuard)
@Controller('gcnotify/v2')
export class GcNotifyController {
  constructor(private readonly gcNotifyApiClient: GcNotifyApiClient) {}

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
    @Req() req: express.Request,
    @Query('template_type') templateType?: 'sms' | 'email',
    @Query('status') status?: string | string[],
    @Query('reference') reference?: string,
    @Query('older_than') olderThan?: string,
    @Query('include_jobs') includeJobs?: boolean,
  ) {
    const statusArray = Array.isArray(status) ? status : status ? [status] : undefined
    const gcNotifyAuthHeader = this.requireAuthHeader(req)
    return this.gcNotifyApiClient.getNotifications(
      {
        template_type: templateType,
        status: statusArray,
        reference,
        older_than: olderThan,
        include_jobs: includeJobs,
      },
      gcNotifyAuthHeader,
    )
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
  async sendEmail(@Body() body: CreateEmailNotificationRequest, @Req() req: express.Request) {
    const gcNotifyAuthHeader = this.requireAuthHeader(req)
    return this.gcNotifyApiClient.sendEmail(body, gcNotifyAuthHeader)
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
  async sendSms(@Body() body: CreateSmsNotificationRequest, @Req() req: express.Request) {
    const gcNotifyAuthHeader = this.requireAuthHeader(req)
    return this.gcNotifyApiClient.sendSms(body, gcNotifyAuthHeader)
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
  async sendBulk(@Body() body: PostBulkRequest, @Req() req: express.Request) {
    const gcNotifyAuthHeader = this.requireAuthHeader(req)
    return this.gcNotifyApiClient.sendBulk(body, gcNotifyAuthHeader)
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
    @Req() req: express.Request,
  ) {
    const gcNotifyAuthHeader = this.requireAuthHeader(req)
    return this.gcNotifyApiClient.getNotificationById(notificationId, gcNotifyAuthHeader)
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
  async getTemplates(@Query('type') type?: 'sms' | 'email', @Req() req?: express.Request) {
    const gcNotifyAuthHeader = this.requireAuthHeader(req!)
    return this.gcNotifyApiClient.getTemplates(type, gcNotifyAuthHeader)
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
  async getTemplate(@Param('templateId') templateId: string, @Req() req: express.Request) {
    const gcNotifyAuthHeader = this.requireAuthHeader(req)
    return this.gcNotifyApiClient.getTemplate(templateId, gcNotifyAuthHeader)
  }

  private requireAuthHeader(req: express.Request): string {
    const authHeader = req.headers['authorization']
    if (typeof authHeader === 'string') {
      const trimmed = authHeader.trim()
      // Validate format: "ApiKey-v1 {key}"
      if (trimmed.startsWith('ApiKey-v1 ')) {
        const key = trimmed.substring('ApiKey-v1 '.length).trim()
        if (key) {
          return trimmed
        }
      }
    }
    throw new BadRequestException(
      'Authorization header is required with format: ApiKey-v1 {api-key}',
    )
  }
}
