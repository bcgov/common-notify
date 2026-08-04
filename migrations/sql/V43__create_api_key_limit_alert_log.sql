-- V43: Create API key limit alert deduplication and delivery-tracking table.
--
-- Atomically claims warning and limit-reached alerts for each API key usage period.
-- Delivery metadata is populated after notification creation and queueing. An incomplete
-- claim remains observable and suppresses automatic retries until repaired operationally.
CREATE TABLE
  notify.api_key_limit_alert_log (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    api_key_consumer_id UUID NOT NULL,
    channel_code VARCHAR(20) NOT NULL,
    period_type_code VARCHAR(20) NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    alert_level VARCHAR(20) NOT NULL,
    notification_request_id UUID,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    enqueued_at TIMESTAMPTZ,
    CONSTRAINT pk_api_key_limit_alert_log PRIMARY KEY (id),
    CONSTRAINT uq_api_key_limit_alert_log UNIQUE (
      api_key_consumer_id,
      channel_code,
      period_type_code,
      period_start,
      alert_level
    ),
    CONSTRAINT fk_api_key_limit_alert_log_consumer FOREIGN KEY (api_key_consumer_id) REFERENCES notify.api_key_consumer (id) ON DELETE CASCADE,
    CONSTRAINT fk_api_key_limit_alert_log_channel FOREIGN KEY (channel_code) REFERENCES notify.notification_channel_code (channel_code),
    CONSTRAINT fk_api_key_limit_alert_log_period FOREIGN KEY (period_type_code) REFERENCES notify.usage_period_type_code (period_type_code),
    CONSTRAINT fk_api_key_limit_alert_log_notification_request FOREIGN KEY (notification_request_id) REFERENCES notify.notification_request (id),
    CONSTRAINT chk_api_key_limit_alert_log_level CHECK (alert_level IN ('WARN', 'LIMIT_REACHED'))
  );

CREATE INDEX idx_api_key_limit_alert_log_consumer_channel ON notify.api_key_limit_alert_log (api_key_consumer_id, channel_code);
