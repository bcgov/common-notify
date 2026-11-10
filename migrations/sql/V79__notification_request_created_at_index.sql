-- The admin Notifications screen lists requests across every tenant by date range, newest first.
-- Without this, each page scans the whole table; tenant-scoped lists use idx_notification_request_tenant_id.
CREATE INDEX IF NOT EXISTS idx_notification_request_created_at
  ON notify.notification_request (created_at DESC);
