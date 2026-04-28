/**
 * Notification Request Status Lifecycle, maps to status in notification_status_code table and used for processing logic in workers and API
 *
 * pending → queued → processing → sending → completed/failed
 *
 * pending: Notification received but not yet queued (temp state if Redis unavailable)
 * queued: Successfully added to queue, awaiting processing
 * processing: Ingestion worker processing channels
 * sending: Delivery worker actively sending
 * completed: Successfully sent
 * failed: Permanently failed (max retries exceeded)
 */
export enum NotificationStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  SENDING = 'sending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ACCEPTED = 'accepted',
  SCHEDULED = 'scheduled',
}
