import { NotificationStatus } from '../enum/notification-status.enum'
import { NotificationChannel } from '../enum/notification-channel.enum'
import {
  NotifySimpleRequest,
  NotifyEmailChannel,
  NotifySmsChannel,
  NotifyMsgAppChannel,
} from '../api/notify/schemas'

/**
 * Union type for all supported request payloads
 */
export type NotifyRequest = NotifySimpleRequest

/**
 * Union type for all supported delivery payloads
 */
export type DeliveryPayload = NotifyEmailChannel | NotifySmsChannel | NotifyMsgAppChannel

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
 * Job payload for ingestion queue
 */
export interface IngestionJobPayload {
  notifyId: string
  correlationId: string
  tenantId: string
  request: NotifyRequest
  requestedAt: string
}

/**
 * Job payload for delivery queues (email, SMS, etc)
 */
export interface DeliveryJobPayload {
  notifyId: string
  correlationId: string
  tenantId: string
  channel: NotificationChannel
  payload: DeliveryPayload
  attempt: number
}
