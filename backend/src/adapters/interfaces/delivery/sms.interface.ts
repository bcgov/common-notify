export interface SendSmsOptions {
  to: string | string[]
  body: string
  from?: string
  /**
   * Our own id for this send, handed to the provider so a later delivery report can be matched
   * back to it. Providers that cannot carry metadata ignore it.
   */
  tag?: string
}

/**
 * What happened to one recipient of a send.
 *
 * A transport that can reach some recipients and not others reports each outcome here instead of
 * throwing, so the worker can record who received the message and retry only those who did not.
 * Throwing on a partial failure is what caused already-delivered recipients to be messaged again
 * when the queue retried the job.
 */
export interface SmsRecipientResult {
  /** The number as it was passed to the transport. */
  to: string
  success: boolean
  /** The provider's id for this message, when it was accepted. */
  messageId?: string
  /** Why this recipient failed, when it did. */
  error?: string
}

export interface SendSmsResult {
  messageId?: string
  providerResponse?: string
  /**
   * Per-recipient outcomes, in the order the recipients were given.
   *
   * Optional so a transport that can only succeed or fail as a whole (and every existing caller)
   * keeps working; when absent the worker treats the send as all-or-nothing.
   */
  results?: SmsRecipientResult[]
}

export interface ISmsTransport {
  readonly name: string
  send(options: SendSmsOptions): Promise<SendSmsResult>
}
