import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import twilio from 'twilio'
import { ISmsTransport, SendSmsOptions, SendSmsResult } from '../../../../interfaces'

@Injectable()
export class TwilioSmsTransport implements ISmsTransport {
  readonly name = 'twilio'
  private readonly logger = new Logger(TwilioSmsTransport.name)
  private client: ReturnType<typeof twilio> | null = null

  constructor(private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>('twilio.accountSid')
    const authToken = this.configService.get<string>('twilio.authToken')
    if (accountSid && authToken) {
      this.client = twilio(accountSid, authToken)
    } else {
      this.logger.warn('Twilio credentials not configured - SMS will be logged but not sent')
    }
  }

  async send(options: SendSmsOptions): Promise<SendSmsResult> {
    // Handle both flat (SendSmsOptions) and nested (NotifySmsChannel) structures
    let to: string | string[]
    let body: string
    let from: string | undefined

    const opts = options as any

    // Check if this is a nested NotifySmsChannel structure
    if (opts.recipients && typeof opts.recipients === 'object') {
      // Nested structure: NotifySmsChannel
      to = opts.recipients.to || []
      body = opts.content?.body || ''
      from = opts.from
    } else {
      // Flat structure: SendSmsOptions
      to = opts.to
      body = opts.body
      from = opts.from
    }

    const resolvedFrom = from ?? this.configService.get<string>('twilio.fromNumber')
    if (!resolvedFrom) {
      throw new Error('SMS from number is required (set twilio.fromNumber or pass in options)')
    }

    // Convert to array for consistent handling
    const toNumbers = Array.isArray(to) ? to : [to]

    if (!this.client) {
      this.logger.log(
        `[Dev mode] Would send SMS to ${toNumbers.join(', ')}: ${body.slice(0, 50)}...`,
      )
      return {
        messageId: `dev-${Date.now()}`,
        providerResponse: 'logged',
      }
    }

    // Send to each recipient (Twilio API only supports one recipient per request)
    const results = []
    for (const recipient of toNumbers) {
      const message = await this.client.messages.create({
        body,
        from: resolvedFrom,
        to: recipient,
      })
      results.push(message.sid)
    }

    return {
      messageId: results[0] || `${Date.now()}`,
      providerResponse: `sent to ${results.length} recipient(s)`,
    }
  }
}
