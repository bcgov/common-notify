import { NotificationStatus } from '../enum/notification-status.enum'
import { NotificationChannel } from '../enum/notification-channel.enum'
import { NotifySimpleRequest } from '../api/notify/schemas/notify-simple-request'
import { NotifyEmailChannel } from '../api/notify/schemas/notify-email-channel'
import { NotifyMsgAppChannel } from '../api/notify/schemas/notify-msg-app-channel'
import { NotifySmsChannel } from '../api/notify/schemas/notify-sms-channel'
import {
  ProcessedNotifyEmailChannel,
  ProcessedNotifyMsgAppChannel,
  ProcessedNotifySimpleRequest,
  ProcessedNotifySmsChannel,
} from '../api/notify/schemas/stored-notify-attachment'

/**
 * Union type for all supported request payloads
 */
export type NotifyRequest = NotifySimpleRequest | ProcessedNotifySimpleRequest

/**
 * Union type for all supported delivery payloads
 */
export type DeliveryPayload =
  | NotifyEmailChannel
  | NotifySmsChannel
  | NotifyMsgAppChannel
  | ProcessedNotifyEmailChannel
  | ProcessedNotifySmsChannel
  | ProcessedNotifyMsgAppChannel

/**
 * Notification Request record stored in database
 */
export interface NotificationRequest {
  id: string // notifyId
  correlationId: string
  tenantId: string
  status: NotificationStatus
  payload: NotifyRequest
  createdAt: Date
  updatedAt?: Date
  errorReason?: string
}

/**
 * Mail-merge payload carried by ingestion and delivery jobs for the merge flow (a request whose
 * recipients use `mergeArray`). It holds what every batch shares: content, rendered from either
 * a server `templateId` or inline `content`, and global `params`. Recipients are not in it -
 * they live in Postgres (the stored request, then one detail row per recipient with its own
 * `params`), so a merge of any size is a few hundred bytes per job in Redis. Per-recipient
 * params override the global ones on a per-key basis.
 */
export interface MailMergeJobData {
  content?: {
    templateId?: string
    subject?: string
    body?: string
    bodyType?: 'text' | 'markdown' | 'html'
    renderer?: 'handlebars' | 'mustache' | 'legacy_gc_notify' | 'mjml'
  }
  params?: Record<string, unknown>
  /**
   * Absent on jobs queued now: ingestion reads recipients from the stored request, and delivery
   * workers from their batch's detail rows. Only jobs queued before that change carry them.
   */
  recipients?: Array<{ address: string; params: Record<string, unknown> }>
}

/**
 * Job payload for ingestion queue
 */
export interface IngestionJobPayload {
  notifyId: string // Database notification_request.id
  tenantId: string
  request: NotifyRequest
  requestedAt: string
  scheduledFor?: string // ISO datetime for delayed sends (optional).  Works by delaying the ingestion job, which in turn delays all downstream delivery jobs.  This simplifies handling of scheduled notifications by centralizing the scheduling logic in one place (ingestion worker) rather than needing to handle scheduling in each delivery worker.
  mailMerge?: boolean // When true, this is a merge send; recipients are read from the stored request
  mailMergeChannel?: NotificationChannel // Which channel the merge fans out to (defaults to EMAIL)
  mailMergeData?: MailMergeJobData
}

/**
 * Job payload for delivery queues (email, SMS, etc)
 */
export interface DeliveryJobPayload {
  notifyId: string // Database notification_request.id
  tenantId: string
  channel: NotificationChannel
  request: NotifyRequest // Original request (channels may carry a content.templateId)
  payload: DeliveryPayload // Channel-specific payload
  attempt: number
  mailMerge?: boolean // When true, this is one batch of a merge send
  batchId?: string // Identifies the batch within the parent notification_request (mail merge only)
  mailMergeData?: MailMergeJobData // Shared content and params; recipients are the batch's detail rows
}

/**
 * Job payload for webhook delivery queue
 */
export interface WebhookJobPayload {
  notificationId: string // Database notification_request.id
  tenantId: string
  webhookId: string // webhook_config.id
  event: string // e.g. 'notification.status.changed'
  payload: Record<string, unknown> // Notification data to POST to the callback URL
}
