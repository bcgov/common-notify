-- Per-recipient personalisation for mail merge sends. Delivery jobs carry only a batch id, and
-- the worker reads each recipient's params from here, so a large merge is not held in Redis.
ALTER TABLE notify.notification_request_detail
  ADD COLUMN params JSONB;

COMMENT ON COLUMN notify.notification_request_detail.params IS
  'Mail merge personalisation for this recipient, merged over the request''s global params when rendering; null for non-merge sends';
