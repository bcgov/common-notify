/**
 * Notification Request Status Lifecycle
 *
 * queued → processing → sending → completed/failed
 */
export enum NotificationStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  SENDING = 'sending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
