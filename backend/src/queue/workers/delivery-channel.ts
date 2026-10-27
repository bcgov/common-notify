/** What the email and SMS delivery workers name differently in logs, errors and audit columns. */
export interface DeliveryChannel {
  /** Structured-log channel. */
  channel: 'email' | 'sms'
  /** The channel as written in log lines. */
  displayName: string
  /** templates.channel_code a template must have to be sent on this channel. */
  templateCode: 'EMAIL' | 'SMS'
  /** A merge send on this channel, as written in log lines and errors. */
  mergeLabel: string
  /** updated_by on the parent request when a merge settles. */
  updatedBy: string
  /** Logger and structured-log context. */
  context: string
}

export const EMAIL_CHANNEL: DeliveryChannel = {
  channel: 'email',
  displayName: 'email',
  templateCode: 'EMAIL',
  mergeLabel: 'mail merge',
  updatedBy: 'email-delivery-worker',
  context: 'EmailDeliveryWorker',
}

export const SMS_CHANNEL: DeliveryChannel = {
  channel: 'sms',
  displayName: 'SMS',
  templateCode: 'SMS',
  mergeLabel: 'SMS merge',
  updatedBy: 'sms-delivery-worker',
  context: 'SmsDeliveryWorker',
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
