-- Add batch_id to group recipients of a bulk send into fixed-size delivery batches.
-- Format: {notification_request id}-{channel}-{index} (e.g. <uuid>-EMAIL-0), so failed
-- batches are easy to identify and retry. Not a UUID, hence VARCHAR.
ALTER TABLE notification_request_detail
  ADD COLUMN batch_id VARCHAR(255);

COMMENT ON COLUMN notification_request_detail.batch_id IS 'Groups recipients of a bulk send into a single delivery batch, formatted as {notification_request id}-{channel}-{index}; null for non-bulk requests';

CREATE INDEX idx_notification_request_detail_batch_id ON notification_request_detail(batch_id);

-- Add PARTIALLY_COMPLETED status for bulk sends where some recipients succeed and some fail.
INSERT INTO
  notification_status_code (code, description, display_name, sort_order, created_by)
VALUES
  (
    'partially_completed',
    'Some recipients were sent successfully and some failed (bulk send)',
    'Partially Completed',
    75,
    'system'
  ) ON CONFLICT (code) DO NOTHING;
