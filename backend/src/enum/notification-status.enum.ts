/**
 * Notification Request Status Lifecycle, maps to status in notification_status_code table and used for processing logic in workers and API
 *
 * pending → queued → processing → sending → completed/failed
 * OR
 * pending → queued → processing → quarantined (if malware detected)
 *
 * pending: Notification received but not yet queued (temp state if Redis unavailable)
 * queued: Successfully added to queue, awaiting processing
 * processing: Ingestion worker processing channels
 * sending: Delivery worker actively sending
 * completed: Successfully sent
 * failed: Permanently failed (max retries exceeded)
 * accepted: Notification request has been accepted but not yet queued
 * scheduled: Notification request has been accepted and scheduled for future processing
 * quarantined: Notification blocked due to malware detected in attachment by ClamAV
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
  QUARANTINED = 'quarantined',
}
