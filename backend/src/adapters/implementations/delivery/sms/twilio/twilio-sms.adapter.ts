import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import twilio from 'twilio'
import {
  ISmsTransport,
  SendSmsOptions,
  SendSmsResult,
  SmsRecipientResult,
} from '../../../../interfaces'
import { TransientDeliveryError, transientFromProviderError } from '../../../../delivery-errors'

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
        results: toNumbers.map((to) => ({ to, success: true, messageId: `dev-${Date.now()}` })),
      }
    }

    // Send to each recipient (Twilio API only supports one recipient per request).
    // Each outcome is captured rather than allowed to escape: without the try/catch, a failure
    // part-way through threw away the knowledge that earlier recipients had already been sent to,
    // and the queue's retry then messaged them a second time.
    const recipientResults: SmsRecipientResult[] = []
    for (const [index, recipient] of toNumbers.entries()) {
      try {
        const message = await this.client.messages.create({
          body,
          from: resolvedFrom,
          to: recipient,
        })
        recipientResults.push({ to: recipient, success: true, messageId: message.sid })
      } catch (error) {
        // Twilio unavailable: stop, and leave this recipient and the rest owed. Carrying on
        // would only fail them too, and earlier successes must still be reported.
        const transient = transientFromProviderError(error, 'Twilio SMS')
        if (transient) {
          this.logger.warn(`Twilio unavailable, ${toNumbers.length - index} recipient(s) left owed`)
          for (const owed of toNumbers.slice(index)) {
            recipientResults.push({
              to: owed,
              success: false,
              error: transient.message,
              transient: true,
            })
          }
          break
        }
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.logger.error(`Twilio send failed for one recipient: ${errorMessage}`)
        recipientResults.push({ to: recipient, success: false, error: errorMessage })
      }
    }

    const succeeded = recipientResults.filter((result) => result.success)
    const owed = recipientResults.filter((result) => result.transient)
    if (succeeded.length === 0 && owed.length > 0 && owed.length === recipientResults.length) {
      throw new TransientDeliveryError(owed[0].error ?? 'Twilio unavailable', 502)
    }

    // Every recipient failing is systemic and worth a retry; a partial failure is not.
    if (succeeded.length === 0 && recipientResults.length > 0) {
      throw new Error(`Twilio send failed for all ${recipientResults.length} recipient(s)`)
    }

    return {
      messageId: succeeded[0]?.messageId || `${Date.now()}`,
      providerResponse: `sent to ${succeeded.length} of ${recipientResults.length} recipient(s)`,
      results: recipientResults,
    }
  }
}
