import { Controller, Post, Get, Body, Param, HttpCode, Version, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiParam, ApiBody, ApiTags } from '@nestjs/swagger'
import { EmailService, EmailResponse, EmailMessage } from './email.service'
import { EmailMessageDto } from './dto/email-message.dto'
import { GetTenant } from '../../common/decorators/get-tenant.decorator'
import { TenantGuard } from '../../common/guards/tenant.guard'
import { Tenant } from '../../admin/tenants/entities/tenant.entity'

@ApiTags('Email')
@Controller('email')
@UseGuards(TenantGuard)
export class EmailController {
  constructor(private emailService: EmailService) {}

  /**
   * Send an email via CHES API
   * Accepts CHESMessage format and forwards to email service
   */
  @Version('1')
  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Send email (requires JWT authentication)' })
  @ApiBody({ type: EmailMessageDto })
  @ApiResponse({
    status: 201,
    description: 'Email sent successfully',
    schema: {
      example: {
        id: 'email_1234567890_abc123def456',
        to: 'recipient@example.com',
        subject: 'Test Email',
        status: 'sent',
        timestamp: '2026-04-07T19:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid email data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing JWT token',
  })
  async send(@Body() emailMessage: EmailMessageDto, @GetTenant() tenant: Tenant) {
    // Map email message to internal format
    const emailData: EmailMessage = {
      from: emailMessage.from || 'noreply@gov.bc.ca',
      to: Array.isArray(emailMessage.to) ? emailMessage.to : [emailMessage.to],
      cc: emailMessage.cc || [],
      bcc: emailMessage.bcc || [],
      subject: emailMessage.subject,
      body: emailMessage.body,
      bodyType: emailMessage.bodyType || 'text',
      encoding: emailMessage.encoding || 'UTF-8',
      priority: emailMessage.priority || 'normal',
      attachments: emailMessage.attachments || [],
      tag: emailMessage.tag,
      delayTs: emailMessage.delayTs,
      mergeData: emailMessage.mergeData || {},
    }

    // Send email using the email service
    return this.emailService.sendEmail(emailData, tenant, '')
  }

  /**
   * Get email status
   */
  @Version('1')
  @Get('status/:id')
  @ApiOperation({ summary: 'Get email delivery status (requires authentication)' })
  @ApiParam({ name: 'id', type: 'string', description: 'Email ID' })
  @ApiResponse({
    status: 200,
    description: 'Email status retrieved',
    type: Object,
    schema: {
      example: {
        id: 'email_1234567890_abc123def456',
        to: 'user@example.com',
        subject: 'Welcome to Notify',
        status: 'sent',
        timestamp: '2026-03-27T12:34:56.789Z',
        tenantId: 1,
        tenantName: 'bchealth-notifications',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Email not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - missing or invalid authentication',
  })
  async getStatus(
    @Param('id') emailId: string,
    @GetTenant() tenant: Tenant,
    @GetTenant('kongId') kongConsumerId: string,
  ): Promise<EmailResponse> {
    return this.emailService.getEmailStatus(emailId, tenant, kongConsumerId)
  }
}

/**
 * CHES (Common Hosted Email Service) API controller
 * Handles requests to /ches/api/v1/email endpoint
 */
@ApiTags('CHES API')
@Controller('ches/api')
@UseGuards(TenantGuard)
export class ChesController {
  constructor(private emailService: EmailService) {}

  /**
   * Send an email via CHES API
   */
  @Version('1')
  @Post('email')
  @HttpCode(201)
  @ApiOperation({ summary: 'Send email via CHES API (requires JWT authentication)' })
  @ApiBody({ type: EmailMessageDto })
  @ApiResponse({
    status: 201,
    description: 'Email sent successfully',
    schema: {
      example: {
        id: 'email_1234567890_abc123def456',
        to: 'recipient@example.com',
        subject: 'Test Email',
        status: 'sent',
        timestamp: '2026-04-07T19:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid email data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing JWT token',
  })
  async send(@Body() emailMessage: EmailMessageDto, @GetTenant() tenant: Tenant) {
    // Map email message to internal format
    const emailData: EmailMessage = {
      from: emailMessage.from || 'noreply@gov.bc.ca',
      to: Array.isArray(emailMessage.to) ? emailMessage.to : [emailMessage.to],
      cc: emailMessage.cc || [],
      bcc: emailMessage.bcc || [],
      subject: emailMessage.subject,
      body: emailMessage.body,
      bodyType: emailMessage.bodyType || 'text',
      encoding: emailMessage.encoding || 'UTF-8',
      priority: emailMessage.priority || 'normal',
      attachments: emailMessage.attachments || [],
      tag: emailMessage.tag,
      delayTs: emailMessage.delayTs,
      mergeData: emailMessage.mergeData || {},
    }

    // Send email using the email service
    return this.emailService.sendEmail(emailData, tenant, '')
  }
}
