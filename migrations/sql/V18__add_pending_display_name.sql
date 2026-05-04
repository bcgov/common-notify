-- V18__add_pending_display_name.sql
-- Add missing display_name for pending notification status code
UPDATE notification_status_code
SET
  display_name = 'Pending'
WHERE
  code = 'pending';
