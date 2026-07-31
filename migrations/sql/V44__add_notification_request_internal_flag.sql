-- V44: Classify internal notification requests.
--
-- Internal requests remain persisted for audit and delivery processing but can be
-- excluded from tenant-facing notification history.
ALTER TABLE notify.notification_request
ADD COLUMN is_internal BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN notify.notification_request.is_internal IS
  'Whether the notification was generated internally rather than initiated by a tenant.';
