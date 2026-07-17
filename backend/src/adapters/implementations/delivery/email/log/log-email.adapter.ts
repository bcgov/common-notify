import { Injectable, Logger } from '@nestjs/common'
import { IEmailTransport, SendEmailOptions, SendEmailResult } from '../../../../interfaces'

/**
 * Log ("sink") email transport.
 *
 * Accepts every message, logs a one-line summary, and returns a synthetic
 * success WITHOUT contacting any external mail provider. Nothing is delivered.
 *
 * Purpose: load/performance testing. Selecting this adapter
 * (DELIVERY_EMAIL_ADAPTER=log) lets a load test exercise the full ingress +
 * queue + worker + status pipeline at high volume without sending real email
 * through CHES. It is a temporary, load-test-only choice — normal environments
 * keep their real adapter (e.g. ches).
 */
@Injectable()
export class LogEmailTransport implements IEmailTransport {
  readonly name = 'log'
  private readonly logger = new Logger(LogEmailTransport.name)

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    // The delivery worker passes either a flat SendEmailOptions or the nested
    // NotifyEmailChannel shape ({ recipients: { to }, content: { subject } }).
    // Normalise just enough to log something useful; never fail on shape.
    const opts = options as any
    let to: unknown
    let subject: unknown
    if (opts.recipients && typeof opts.recipients === 'object' && !Array.isArray(opts.recipients)) {
      to = opts.recipients.to
      subject = opts.content?.subject
    } else if (Array.isArray(opts.recipients)) {
      to = opts.recipients
      subject = opts.subject
    } else {
      to = opts.to
      subject = opts.subject
    }

    const recipientCount = Array.isArray(to) ? to.length : to ? 1 : 0
    this.logger.log(
      `[SINK] Discarded email (not sent): recipients=${recipientCount}, subject="${subject ?? ''}"`,
    )

    return {
      messageId: `log-sink-${Date.now()}`,
      providerResponse: 'accepted-by-log-sink (no delivery)',
    }
  }
}
