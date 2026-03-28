import { Injectable, Logger } from '@nestjs/common'
import { SendEmailDto } from './dto/send-email.dto'
import { Tenant } from '../../admin/tenants/entities/tenant.entity'

export interface EmailResponse {
  id: string
  to: string
  subject: string
  status: 'sent' | 'pending' | 'failed'
  timestamp: Date
  tenantId?: number
  tenantName?: string
}

/**
 * Email Service
 * Handles email sending functionality (currently mocked)
 *
 * TODO: Integrate with actual email provider (SendGrid, AWS SES, etc)
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)

  /**
   * Send an email
   * @param sendEmailDto Email details
   * @param tenant The authenticated tenant making the request
   * @param kongConsumerId Kong's consumer ID for the tenant
   * @returns Email response with status and tenant info
   */
  async sendEmail(
    sendEmailDto: SendEmailDto,
    tenant: Tenant,
    kongConsumerId: string,
  ): Promise<EmailResponse> {
    const { to, subject, body, cc, bcc } = sendEmailDto
    this.logger.log(
      `[Tenant: ${tenant.name} (DB ID: ${tenant.id}, Kong ID: ${kongConsumerId})] Sending email to: ${to}, subject: ${subject}`,
    )
    if (cc) {
      this.logger.log(`[Tenant: ${tenant.name} (Kong ID: ${kongConsumerId})] CC: ${cc}`)
    }
    if (bcc) {
      this.logger.log(`[Tenant: ${tenant.name} (Kong ID: ${kongConsumerId})] BCC: ${bcc}`)
    }
    this.logger.debug(`[Tenant: ${tenant.name}] Body: ${body}`)

    // Mock response - simulate successful email send
    const mockEmailId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    return {
      id: mockEmailId,
      to,
      subject,
      status: 'sent',
      timestamp: new Date(),
      tenantId: tenant.id,
      tenantName: tenant.name,
    }
  }

  /**
   * Get email status
   * @param emailId Email ID to check
   * @param tenant The authenticated tenant making the request
   * @param kongConsumerId Kong's consumer ID for the tenant
   * @returns Email status
   */
  async getEmailStatus(
    emailId: string,
    tenant: Tenant,
    kongConsumerId: string,
  ): Promise<EmailResponse> {
    this.logger.log(
      `[Tenant: ${tenant.name} (DB ID: ${tenant.id}, Kong ID: ${kongConsumerId})] Getting status for email: ${emailId}`,
    )

    // Mock response
    return {
      id: emailId,
      to: 'user@example.com',
      subject: 'Test Email',
      status: 'sent',
      timestamp: new Date(),
      tenantId: tenant.id,
      tenantName: tenant.name,
    }
  }
}
