-- Create notification status code table
CREATE TABLE notification_status_code (
  code VARCHAR(20) PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(200)
);

-- seed the table with statuses
INSERT INTO notification_status_code (code, description, created_by)
VALUES
('queued', 'Notification request has been queued', 'system'),
('processing', 'Notification is currently being processed', 'system'),
('completed', 'Notification was successfully delivered', 'system'),
('failed', 'Notification delivery failed', 'system');

-- notification status code table comments
COMMENT ON TABLE notification_status_code IS 'Lookup table for notification request statuses';

COMMENT ON COLUMN notification_status_code.code IS 'Unique status code identifier';
COMMENT ON COLUMN notification_status_code.description IS 'Human-readable description of the status';
COMMENT ON COLUMN notification_status_code.created_at IS 'Timestamp when the record was created';
COMMENT ON COLUMN notification_status_code.created_by IS 'User or system that created the record';
COMMENT ON COLUMN notification_status_code.updated_at IS 'Timestamp when the record was last updated';
COMMENT ON COLUMN notification_status_code.updated_by IS 'User or system that last updated the record';

-- create notification request table
CREATE TABLE notification_request (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(200),
  CONSTRAINT fk_notification_status
    FOREIGN KEY (status)
    REFERENCES notification_status_code(code)
);

-- notification request table comments
COMMENT ON TABLE notification_request IS 'Stores all incoming notification requests for auditing and tracking';

COMMENT ON COLUMN notification_request.id IS 'Unique identifier for the notification request';
COMMENT ON COLUMN notification_request.tenant_id IS 'Tenant that submitted the request';
COMMENT ON COLUMN notification_request.status IS 'Processing status of the notification request';
COMMENT ON COLUMN notification_request.created_at IS 'Timestamp when the request was created';
COMMENT ON COLUMN notification_request.created_by IS 'User or system that created the request';
COMMENT ON COLUMN notification_request.updated_at IS 'Timestamp when the request was last updated';
COMMENT ON COLUMN notification_request.updated_by IS 'User or system that last updated the request';