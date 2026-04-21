-- Add PENDING status for Pattern 2 (Write to DB + Periodic Requeue) implementation
-- Notifications stay PENDING until successfully queued to Redis
-- Add SENDING status for email delivery worker
-- Notifications transition to SENDING state while actively being delivered
INSERT INTO
  notification_status_code (code, description, created_by)
VALUES
  (
    'pending',
    'Notification request accepted but not yet queued (will be retried)',
    'system'
  ),
  (
    'sending',
    'Notification is being actively sent',
    'system'
  ) ON CONFLICT (code) DO NOTHING;
