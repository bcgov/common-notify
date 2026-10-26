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

  /**
   * Callers pass either the flat SendSmsOptions or a nested NotifySmsChannel, so read both shapes
   * into one.
   */
  private readSendOptions(options: SendSmsOptions): {
    toNumbers: string[]
    body: string
    from?: string
  } {
    const opts = options as any

    if (opts.recipients && typeof opts.recipients === 'object') {
      const to = opts.recipients.to || []
      return {
        toNumbers: Array.isArray(to) ? to : [to],
        body: opts.content?.body || '',
        from: opts.from,
      }
    }

    return {
      toNumbers: Array.isArray(opts.to) ? opts.to : [opts.to],
      body: opts.body,
      from: opts.from,
    }
  }

  /**
   * One request per recipient, because the Twilio API takes one at a time.
   *
   * Each outcome is captured rather than allowed to escape: without the try/catch, a failure
   * part-way through threw away the knowledge that earlier recipients had already been sent to,
   * and the queue's retry then messaged them a second time.
   */
  private async sendEach(
    toNumbers: string[],
    body: string,
    from: string,
  ): Promise<SmsRecipientResult[]> {
    const results: SmsRecipientResult[] = []

    for (const [index, recipient] of toNumbers.entries()) {
      try {
        const message = await this.client!.messages.create({ body, from, to: recipient })
        results.push({ to: recipient, success: true, messageId: message.sid })
      } catch (error) {
        // Twilio unavailable: stop, and leave this recipient and the rest owed. Carrying on
        // would only fail them too, and earlier successes must still be reported.
        const transient = transientFromProviderError(error, 'Twilio SMS')
        if (transient) {
          this.logger.warn(`Twilio unavailable, ${toNumbers.length - index} recipient(s) left owed`)
          for (const owed of toNumbers.slice(index)) {
            results.push({ to: owed, success: false, error: transient.message, transient: true })
          }
          return results
        }

        const errorMessage = error instanceof Error ? error.message : String(error)
        this.logger.error(`Twilio send failed for one recipient: ${errorMessage}`)
        results.push({ to: recipient, success: false, error: errorMessage })
      }
    }

    return results
  }

  async send(options: SendSmsOptions): Promise<SendSmsResult> {
    const { toNumbers, body, from } = this.readSendOptions(options)

    const resolvedFrom = from ?? this.configService.get<string>('twilio.fromNumber')
    if (!resolvedFrom) {
      throw new Error('SMS from number is required (set twilio.fromNumber or pass in options)')
    }

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

    const recipientResults = await this.sendEach(toNumbers, body, resolvedFrom)

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
