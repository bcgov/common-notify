/**
 * Email recipients configuration
 */
export interface NotifyEmailRecipients {
  to: string[]
  cc?: string[]
  bcc?: string[]
}

/**
 * Content configuration for notifications
 */
export interface NotifyContent {
  subject?: string
  body: string
  bodyType?: 'html' | 'text'
  encoding?: string
}

/**
 * Email channel configuration for notifications
 */
export interface NotifyEmailChannel {
  recipients: NotifyEmailRecipients
  content?: NotifyContent
  delayedSend?: string
  params?: Record<string, unknown>
  templateId?: string
  identityId?: string
  attachments?: NotifyAttachment[]
}

export interface NotifyAttachment {
  content?: string
  contentType?: string
  filename?: string
  disposition?: string
}

/**
 * SMS channel configuration for notifications
 */
export interface NotifySmsChannel {
  recipients: {
    to: string[]
  }
  content?: {
    body: string
  }
  delayedSend?: string
  params?: Record<string, unknown>
  templateId?: string
}

/**
 * Messaging app channel configuration for notifications
 */
export interface NotifyMsgAppChannel {
  recipients: {
    to: string[]
  }
  content?: {
    title?: string
    body: string
  }
  delayedSend?: string
  params?: Record<string, unknown>
  templateId?: string
}

/**
 * Simple notification request payload
 * Matches backend NotifySimpleRequest DTO
 */
export interface NotifySimpleRequest {
  params?: Record<string, unknown>
  templateId?: string
  email?: NotifyEmailChannel
  sms?: NotifySmsChannel
  msgApp?: NotifyMsgAppChannel
}
