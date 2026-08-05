import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SmsClient } from '@azure/communication-sms'
import { ISmsTransport, SendSmsOptions, SendSmsResult } from '../../../../interfaces'

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
      }
    }

    const results = await this.client.send({
      from: resolvedFrom,
      to: toNumbers,
      message: body,
    })

    const failedResults = results.filter((result) => result.successful === false)
    if (failedResults.length > 0) {
      this.logger.error(
        `ACS send failures: ${JSON.stringify(
          failedResults.map((result) => ({
            to: result.to,
            errorMessage: result.errorMessage,
            httpStatusCode: result.httpStatusCode,
          })),
        )}`,
      )

      // KNOWN LIMITATION: on partial recipient failure, this throws to fail the whole
      // job, which causes Bull to retry the entire batch — including recipients who
      // already succeeded. This can duplicate-send SMS to already-delivered recipients.
      // Fixing this requires per-recipient retry granularity (ISmsTransport contract
      // change + SmsDeliveryWorker retry logic), tracked separately — do not enable
      // ACS for real tenant traffic until that follow-up ticket lands.
      throw new Error(`ACS send failed for ${failedResults.length} of ${results.length} recipients`)
    }

    return {
      messageId: results[0]?.messageId,
      providerResponse: `sent to ${results.length} recipient(s)`,
    }
  }
}
