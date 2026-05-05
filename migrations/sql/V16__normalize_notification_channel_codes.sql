-- V16__normalize_notification_channel_codes.sql
-- Normalize notification channel codes to uppercase values
-- This ensures consistency with NotificationChannel enum which uses uppercase values (EMAIL, SMS)
-- Update notification_channel_code table - ensure all codes are uppercase (defensive measure)
UPDATE notify.notification_channel_code
SET
  channel_code = UPPER(channel_code)
WHERE
  channel_code != UPPER(channel_code);

-- Update template table - ensure all channel codes are uppercase
UPDATE notify.template
SET
  channel_code = UPPER(channel_code)
WHERE
  channel_code != UPPER(channel_code);

-- Note: If notification_request table has a channel column, uncomment and use:
-- UPDATE notify.notification_request
-- SET channel = UPPER(channel)
-- WHERE channel != UPPER(channel);
-- Add comment documenting the migration
COMMENT ON TABLE notify.notification_channel_code IS 'Code table for notification channel types. Channel codes are uppercase (EMAIL, SMS).
This ensures consistency with the NotificationChannel TypeScript enum.';
