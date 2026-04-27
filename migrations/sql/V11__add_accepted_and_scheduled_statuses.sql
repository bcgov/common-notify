-- Add new notification statuses for improved request lifecycle tracking
INSERT INTO
  notification_status_code (code, description, created_by)
VALUES
  (
    'accepted',
    'Notification request has been accepted but not yet queued',
    'system'
  ),
  (
    'scheduled',
    'Notification request has been accepted and scheduled for future processing',
    'system'
  );

-- notification status code table comments
COMMENT ON COLUMN notification_status_code.code IS 'Unique status code identifier';

COMMENT ON COLUMN notification_status_code.description IS 'Human-readable description of the status';

COMMENT ON COLUMN notification_status_code.created_by IS 'User or system that created the record';
