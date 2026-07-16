ALTER TABLE notification_request_detail
  ADD COLUMN batch_id VARCHAR(255);

COMMENT ON COLUMN notification_request_detail.batch_id IS 'Groups recipients of a bulk send into a single delivery batch, formatted as {notification_request id}-{channel}-{index}; null for non-bulk requests';

CREATE INDEX idx_notification_request_detail_batch_id ON notification_request_detail(batch_id);

INSERT INTO
  notification_status_code (code, description, display_name, sort_order, created_by)
VALUES
  (
    'partially_completed',
    'Some recipients were sent successfully and some failed',
    'Partially Completed',
    75,
    'system'
  ) ON CONFLICT (code) DO NOTHING;
