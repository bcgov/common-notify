import { Controller, Post, Get, Body, Param, HttpCode, Version, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiParam, ApiBody, ApiTags } from '@nestjs/swagger'
import { EmailService, EmailResponse } from './email.service'
import { SendEmailDto } from './dto/send-email.dto'
import { GetTenant } from '../../common/decorators/get-tenant.decorator'
import { TenantGuard } from '../../common/guards/tenant.guard'
import { Tenant } from '../../admin/tenants/entities/tenant.entity'

@ApiTags('Email')
@Controller('email')
@UseGuards(TenantGuard)
export class EmailController {
  constructor(private emailService: EmailService) {}

  /**
   * Send an email
   */
  @Version('1')
  @Post('send')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send an email (requires Kong API key authentication)' })
  @ApiBody({ type: SendEmailDto })
  @ApiResponse({
    status: 200,
    description: 'Email sent successfully',
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
    status: 400,
    description: 'Invalid email data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - missing or invalid API key',
  })
  async send(
    @Body() sendEmailDto: SendEmailDto,
    @GetTenant() tenant: Tenant,
    @GetTenant('kongId') kongConsumerId: string,
  ): Promise<EmailResponse> {
    return this.emailService.sendEmail(sendEmailDto, tenant, kongConsumerId)
  }

  /**
   * Get email status
   */
  @Version('1')
  @Get('status/:id')
  @ApiOperation({ summary: 'Get email delivery status (requires Kong API key authentication)' })
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
    description: 'Unauthorized - missing or invalid API key',
  })
  async getStatus(
    @Param('id') emailId: string,
    @GetTenant() tenant: Tenant,
    @GetTenant('kongId') kongConsumerId: string,
  ): Promise<EmailResponse> {
    return this.emailService.getEmailStatus(emailId, tenant, kongConsumerId)
  }
}
