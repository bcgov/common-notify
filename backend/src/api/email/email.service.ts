import { Injectable, Logger } from '@nestjs/common'
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
 * Generic email message interface
 */
export interface EmailMessage {
  from?: string
  to: string | string[]
  subject: string
  body: string
  cc?: string | string[]
  bcc?: string | string[]
  [key: string]: any
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
   * @param emailMessage Email details
   * @param tenant The authenticated tenant making the request
   * @param kongConsumerId Kong's consumer ID for the tenant (optional)
   * @returns Email response with status and tenant info
   */
  async sendEmail(
    emailMessage: EmailMessage,
    tenant: Tenant,
    kongConsumerId: string = '',
  ): Promise<EmailResponse> {
    const to = Array.isArray(emailMessage.to) ? emailMessage.to[0] : emailMessage.to
    const { subject, body, cc, bcc } = emailMessage

    const tenantInfo = kongConsumerId
      ? `[Tenant: ${tenant.name} (DB ID: ${tenant.id}, Kong ID: ${kongConsumerId})]`
      : `[Tenant: ${tenant.name} (DB ID: ${tenant.id})]`

    this.logger.log(`${tenantInfo} Sending email to: ${to}, subject: ${subject}`)
    if (cc) {
      this.logger.log(`${tenantInfo} CC: ${cc}`)
    }
    if (bcc) {
      this.logger.log(`${tenantInfo} BCC: ${bcc}`)
    }
    this.logger.debug(`${tenantInfo} Body: ${body}`)

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
