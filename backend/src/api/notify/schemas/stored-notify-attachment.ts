import { NotifySimpleRequest } from './notify-simple-request'
import { NotifyEmailChannel } from './notify-email-channel'
import { NotifySmsChannel } from './notify-sms-channel'
import { NotifyMsgAppChannel } from './notify-msg-app-channel'

export interface StoredNotifyAttachment {
  attachmentId: string
}

export interface ProcessedNotifyEmailChannel extends Omit<NotifyEmailChannel, 'attachments'> {
  attachments?: StoredNotifyAttachment[]
}

export interface ProcessedNotifySmsChannel extends Omit<NotifySmsChannel, 'attachments'> {
  attachments?: StoredNotifyAttachment[]
}

export interface ProcessedNotifyMsgAppChannel extends Omit<NotifyMsgAppChannel, 'attachments'> {
  attachments?: StoredNotifyAttachment[]
}

export interface ProcessedNotifySimpleRequest extends Omit<
  NotifySimpleRequest,
  'email' | 'sms' | 'msgApp'
> {
  email?: ProcessedNotifyEmailChannel
  sms?: ProcessedNotifySmsChannel
  msgApp?: ProcessedNotifyMsgAppChannel
}
