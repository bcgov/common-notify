-- Admin queue monitoring counts recipients sent and failed per minute over the last hour.
-- Partial so the index holds only finished rows and the range scan stays to that hour, rather
-- than the status index returning every sent row the table has ever held.
CREATE INDEX idx_notification_request_detail_finished_at
  ON notify.notification_request_detail (last_attempt_at)
  WHERE status IN ('sent', 'failed');
