-- Add channel_code column with FK to notification_channel_code
ALTER TABLE notify.notification_request
ADD COLUMN channel_code VARCHAR(20) NULL;

-- Add FK constraint for channel_code
ALTER TABLE notify.notification_request ADD CONSTRAINT fk_notification_channel_code FOREIGN KEY (channel_code) REFERENCES notify.notification_channel_code (channel_code);

-- Comment for channel_code
COMMENT ON COLUMN notify.notification_request.channel_code IS 'The primary channel type for this notification (EMAIL, SMS, MSGAPP, or MULTIPLE if multiple channels)';

-- Add delayed_send_time column to store scheduled send time
ALTER TABLE notify.notification_request
ADD COLUMN delayed_send_time TIMESTAMPTZ NULL;

-- Comment for delayed_send_time
COMMENT ON COLUMN notify.notification_request.delayed_send_time IS 'When set, indicates the notification should be delivered at this time instead of immediately';

-- Add recipients column as JSONB array to store all recipients
-- Structure: {"email": ["addr@example.com"], "sms": ["+1234567890"], "msgApp": ["user123"]}
ALTER TABLE notify.notification_request
ADD COLUMN recipients JSONB NULL;

-- Comment for recipients
COMMENT ON COLUMN notify.notification_request.recipients IS 'Stores recipients as JSONB object with channels as keys (email, sms, msgApp), each containing an array of recipient addresses/identifiers';

-- Create indexes for efficient querying
CREATE INDEX idx_notification_request_channel ON notify.notification_request (channel_code)
WHERE
  channel_code IS NOT NULL;

CREATE INDEX idx_notification_request_delayed_send ON notify.notification_request (delayed_send_time)
WHERE
  delayed_send_time IS NOT NULL;
