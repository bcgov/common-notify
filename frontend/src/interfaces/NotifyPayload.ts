/**
 * Email channel configuration for notifications
 */
export interface NotifyEmailChannel {
  to: string[]
  subject: string
  body: string
}

/**
 * SMS channel configuration for notifications
 */
export interface NotifySmsChannel {
  recipients: string[]
  body: string
}

/**
 * Messaging app channel configuration for notifications
 */
export interface NotifyMsgAppChannel {
  recipients: string[]
  title: string
  body: string
}

/**
 * Simple notification request payload
 * Matches backend NotifySimpleRequest DTO
 */
export interface NotifySimpleRequest {
  params?: Record<string, unknown>
  email?: NotifyEmailChannel
  sms?: NotifySmsChannel
  msgApp?: NotifyMsgAppChannel
}
