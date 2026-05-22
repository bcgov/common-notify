-- Add CANCELLED status for cancelled notifications
INSERT INTO
  notification_status_code (code, description, created_by)
VALUES
  (
    'cancelled',
    'Notification was cancelled before delivery',
    'system'
  ) ON CONFLICT (code) DO NOTHING;
