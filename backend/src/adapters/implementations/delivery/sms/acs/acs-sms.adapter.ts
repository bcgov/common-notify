import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SmsClient } from '@azure/communication-sms'
import {
  ISmsTransport,
  SendSmsOptions,
  SendSmsResult,
  SmsRecipientResult,
} from '../../../../interfaces'

@Injectable()
export class AcsSmsTransport implements ISmsTransport {
  readonly name = 'acs'
  private readonly logger = new Logger(AcsSmsTransport.name)
  private client: SmsClient | null = null

  constructor(private readonly configService: ConfigService) {
    const connectionString = this.configService.get<string>('acs.connectionString')
    if (connectionString) {
      this.client = new SmsClient(connectionString)
    } else {
      this.logger.warn('ACS connection string not configured - SMS will be logged but not sent')
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

    const resolvedFrom = from ?? this.configService.get<string>('acs.fromNumber')
    if (!resolvedFrom) {
      throw new Error('SMS from number is required (set acs.fromNumber or pass in options)')
    }

    // Convert to array for consistent handling
    const toNumbers = Array.isArray(to) ? to : [to]

    if (!this.client) {
      this.logger.log(
        `[Dev mode] Would send SMS via ACS to ${toNumbers.join(', ')}: ${body.slice(0, 50)}...`,
      )
      return {
        messageId: `dev-acs-${Date.now()}`,
        providerResponse: 'logged',
        results: toNumbers.map((to) => ({ to, success: true, messageId: `dev-acs-${Date.now()}` })),
      }
    }

    const results = await this.client.send(
      {
        from: resolvedFrom,
        to: toNumbers,
        message: body,
      },
      {
        // ACS only emits SMSDeliveryReportReceived events when this is set at send time, so it has
        // to be on now for those reports to exist later. Nothing consumes them yet: acceptance by
        // ACS is not delivery, and a number pending regulatory approval is accepted and then
        // dropped by the carrier with no signal back to us.
        enableDeliveryReport: true,
        // Comes back on the delivery report, so it can be matched to our notification.
        tag: opts.tag,
      },
    )

    // ACS reports each recipient separately, so report them onward rather than collapsing the
    // send into one success or failure. Throwing on a partial failure used to fail the whole job,
    // and the queue's retry then re-sent to recipients who had already received the message.
    const recipientResults: SmsRecipientResult[] = results.map((result) => ({
      to: result.to,
      success: result.successful === true,
      messageId: result.successful ? result.messageId : undefined,
      error: result.successful
        ? undefined
        : (result.errorMessage ?? `ACS returned HTTP ${result.httpStatusCode}`),
    }))

    const failed = recipientResults.filter((result) => !result.success)
    if (failed.length > 0) {
      this.logger.error(
        `ACS send failures: ${JSON.stringify(failed.map(({ to, error }) => ({ to, error })))}`,
      )
    }

    // Every recipient failing is systemic - a bad credential, a disabled number - and worth a
    // retry of the whole job. A partial failure is not: the successes must not be repeated.
    if (failed.length === recipientResults.length && recipientResults.length > 0) {
      throw new Error(`ACS send failed for all ${recipientResults.length} recipient(s)`)
    }

    const succeeded = recipientResults.filter((result) => result.success)
    return {
      messageId: succeeded[0]?.messageId,
      providerResponse: `sent to ${succeeded.length} of ${recipientResults.length} recipient(s)`,
      results: recipientResults,
    }
  }
}
