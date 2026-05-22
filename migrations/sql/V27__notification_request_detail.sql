-- Seed missing status codes required by the FK constraint below
INSERT INTO notification_status_code (code, description, display_name, created_by)
VALUES
  ('sent', 'Notification was successfully sent to the provider', 'Sent', 'system'),
  ('bounced', 'Notification bounced and was not delivered to the recipient', 'Bounced', 'system')
ON CONFLICT (code) DO NOTHING;

-- Create notification request detail table
CREATE TABLE notification_request_detail (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_request_id UUID NOT NULL,
  recipient_address VARCHAR(255) NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'email',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  provider_response_id VARCHAR(255),
  provider_response JSONB,
  error_message TEXT,
  attempt_count INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(200),
  CONSTRAINT fk_notification_request
    FOREIGN KEY (notification_request_id)
    REFERENCES notification_request(id) ON DELETE CASCADE,
  CONSTRAINT fk_delivery_status
    FOREIGN KEY (status)
    REFERENCES notification_status_code(code),
  CONSTRAINT uq_notification_request_detail_recipient
    UNIQUE (notification_request_id, recipient_address, channel)
);
-- notification request detail table comments
COMMENT ON TABLE notification_request_detail IS 'Tracks individual delivery status for each recipient in a notification request';
COMMENT ON COLUMN notification_request_detail.id IS 'Unique identifier for this delivery attempt';
COMMENT ON COLUMN notification_request_detail.notification_request_id IS 'Reference to the parent notification request';
COMMENT ON COLUMN notification_request_detail.recipient_address IS 'Address of the recipient (email, phone number, etc)';
COMMENT ON COLUMN notification_request_detail.channel IS 'Channel used for delivery (email, sms, etc)';
COMMENT ON COLUMN notification_request_detail.status IS 'Current delivery status (pending, sent, failed, bounced)';
COMMENT ON COLUMN notification_request_detail.provider_response_id IS 'Message ID or transaction ID from the provider (GC Notify, etc)';
COMMENT ON COLUMN notification_request_detail.provider_response IS 'Full JSON response from the provider for debugging';
COMMENT ON COLUMN notification_request_detail.error_message IS 'Error message if delivery failed';
COMMENT ON COLUMN notification_request_detail.attempt_count IS 'Number of delivery attempts made';
COMMENT ON COLUMN notification_request_detail.last_attempt_at IS 'Timestamp of the most recent delivery attempt';
COMMENT ON COLUMN notification_request_detail.created_at IS 'Timestamp when the delivery record was created';
COMMENT ON COLUMN notification_request_detail.created_by IS 'User or system that created the record';
COMMENT ON COLUMN notification_request_detail.updated_at IS 'Timestamp when the record was last updated';
COMMENT ON COLUMN notification_request_detail.updated_by IS 'User or system that last updated the record';
-- Create indexes for common queries
CREATE INDEX idx_notification_request_detail_request_id ON notification_request_detail(notification_request_id);
CREATE INDEX idx_notification_request_detail_status ON notification_request_detail(status);
CREATE INDEX idx_notification_request_detail_recipient ON notification_request_detail(recipient_address);
