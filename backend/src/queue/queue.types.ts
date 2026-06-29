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
 * Bulk email payload carried by ingestion and delivery jobs for the /notifysimple/bulk flow.
 * On the ingestion job `recipients` holds every recipient; on a delivery job it holds only
 * the recipients of a single batch (identified by `batchId`). `params` are global params
 * applied when rendering the template; per-recipient `params` override them on a per-key basis.
 */
export interface BulkEmailJobData {
  name: string
  templateId: string
  params?: Record<string, unknown>
  recipients: Array<{ address: string; params: Record<string, unknown> }>
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
  bulk?: boolean // When true, this is a bulk email send and `bulkEmail` carries the recipients
  bulkEmail?: BulkEmailJobData
}

/**
 * Job payload for delivery queues (email, SMS, etc)
 */
export interface DeliveryJobPayload {
  notifyId: string // Database notification_request.id
  tenantId: string
  channel: NotificationChannel
  request: NotifyRequest // Original request (may contain templateId)
  payload: DeliveryPayload // Channel-specific payload
  attempt: number
  bulk?: boolean // When true, this is one batch of a bulk email send
  batchId?: string // Identifies the batch within the parent notification_request (bulk only)
  bulkEmail?: BulkEmailJobData // Recipients for this batch (bulk only)
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
