import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  PinpointSMSVoiceV2Client,
  SendTextMessageCommand,
} from '@aws-sdk/client-pinpoint-sms-voice-v2'
import {
  ISmsTransport,
  SendSmsOptions,
  SendSmsResult,
  SmsRecipientResult,
} from '../../../../interfaces'
import { TransientDeliveryError, transientFromProviderError } from '../../../../delivery-errors'
import { mountedAccessKeyProvider } from './aws-sms-credentials'

/** The worker sends a NotifySmsChannel (`recipients.to`, `content.body`) rather than the flat shape. */
type SmsSendInput = SendSmsOptions & {
  recipients?: { to?: string | string[] }
  content?: { body?: string }
}

const toArray = (to: string | string[] | undefined): string[] => {
  if (to === undefined) return []
  return Array.isArray(to) ? to : [to]
}

/** AWS End User Messaging SMS (the `pinpoint-sms-voice-v2` API). */
@Injectable()
export class AwsSmsTransport implements ISmsTransport {
  readonly name = 'aws'
  private readonly logger = new Logger(AwsSmsTransport.name)
  private readonly client: PinpointSMSVoiceV2Client | null = null

  constructor(private readonly configService: ConfigService) {
    // The key rotates every two days, so it is read from the mounted Secret files rather than
    // from environment variables, which a running pod never sees change.
    const credentialsDir = this.configService.get<string>('awsSms.credentialsDir')
    if (credentialsDir) {
      this.client = new PinpointSMSVoiceV2Client({
        region: this.configService.get<string>('awsSms.region'),
        credentials: mountedAccessKeyProvider(credentialsDir),
      })
    } else {
      this.logger.warn(
        'AWS SMS credentials directory not configured - SMS will be logged but not sent',
      )
    }
  }

  private readSendOptions(options: SmsSendInput): { toNumbers: string[]; body: string } {
    if (options.recipients && typeof options.recipients === 'object') {
      return { toNumbers: toArray(options.recipients.to), body: options.content?.body ?? '' }
    }
    return { toNumbers: toArray(options.to), body: options.body }
  }

  /**
   * One request per recipient, because SendTextMessage takes one destination.
   *
   * Each outcome is captured rather than allowed to escape, so a failure part-way through does
   * not lose the earlier successes and get them messaged again on the queue's retry. The SDK has
   * already retried throttling and 5xx by the time a send throws.
   */
  private async sendEach(
    toNumbers: string[],
    body: string,
    from: string,
    tag: string | undefined,
  ): Promise<SmsRecipientResult[]> {
    const results: SmsRecipientResult[] = []

    for (const [index, recipient] of toNumbers.entries()) {
      try {
        const response = await this.client!.send(
          new SendTextMessageCommand({
            DestinationPhoneNumber: recipient,
            OriginationIdentity: from,
            MessageBody: body,
            MessageType: 'TRANSACTIONAL',
            // Echoed on delivery events, so a report can be matched back to our notification.
            ...(tag && { Context: { notifyId: tag } }),
          }),
        )
        results.push({ to: recipient, success: true, messageId: response.MessageId })
      } catch (error) {
        // AWS unavailable: stop, and leave this recipient and the rest owed.
        const transient = transientFromProviderError(error, 'AWS SMS')
        if (transient) {
          this.logger.warn(
            `AWS SMS unavailable, ${toNumbers.length - index} recipient(s) left owed`,
          )
          for (const owed of toNumbers.slice(index)) {
            results.push({ to: owed, success: false, error: transient.message, transient: true })
          }
          return results
        }

        const errorMessage = error instanceof Error ? error.message : String(error)
        this.logger.error(`AWS SMS send failed for one recipient: ${errorMessage}`)
        results.push({ to: recipient, success: false, error: errorMessage })
      }
    }

    return results
  }

  async send(options: SendSmsOptions): Promise<SendSmsResult> {
    const { toNumbers, body } = this.readSendOptions(options)

    // The sending number will come from the tenant; until then every tenant uses the default.
    const from = options.from ?? this.configService.get<string>('awsSms.fromNumber')
    if (!from) {
      throw new Error('SMS from number is required (set awsSms.fromNumber or pass in options)')
    }

    if (!this.client) {
      this.logger.log(
        `[Dev mode] Would send SMS via AWS to ${toNumbers.join(', ')}: ${body.slice(0, 50)}...`,
      )
      return {
        messageId: `dev-aws-${Date.now()}`,
        providerResponse: 'logged',
        results: toNumbers.map((to) => ({ to, success: true, messageId: `dev-aws-${Date.now()}` })),
      }
    }

    const recipientResults = await this.sendEach(toNumbers, body, from, options.tag)

    const succeeded = recipientResults.filter((result) => result.success)
    if (succeeded.length > 0 || recipientResults.length === 0) {
      return {
        messageId: succeeded[0]?.messageId,
        providerResponse: `sent to ${succeeded.length} of ${recipientResults.length} recipient(s)`,
        results: recipientResults,
      }
    }

    // Every recipient failing is systemic - a bad credential, an unregistered number - and worth
    // a retry of the whole job. A partial failure is not: the successes must not be repeated.
    const message = `AWS SMS send failed for all ${recipientResults.length} recipient(s)`
    if (recipientResults.every((result) => result.transient)) {
      throw new TransientDeliveryError(recipientResults[0]?.error ?? message, 502)
    }
    throw new Error(message)
  }
}
