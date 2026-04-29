-- Create notification_channel_code table (code table pattern)
CREATE TABLE
  notify.notification_channel_code (
    channel_code VARCHAR(20) PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_by VARCHAR(200)
  );

COMMENT ON TABLE notify.notification_channel_code IS 'Code table for notification channel types. Defines all valid channels for sending notifications.';

COMMENT ON COLUMN notify.notification_channel_code.channel_code IS 'Channel code (e.g., EMAIL, SMS). Primary key.';

COMMENT ON COLUMN notify.notification_channel_code.description IS 'Human-readable description of the channel.';

COMMENT ON COLUMN notify.notification_channel_code.created_at IS 'Timestamp when the channel code was created.';

COMMENT ON COLUMN notify.notification_channel_code.created_by IS 'User or process that created this record.';

COMMENT ON COLUMN notify.notification_channel_code.updated_at IS 'Timestamp when the channel code was last updated.';

COMMENT ON COLUMN notify.notification_channel_code.updated_by IS 'User or process that last updated this record.';

-- Seed channel codes
INSERT INTO
  notify.notification_channel_code (channel_code, description, created_by, updated_by)
VALUES
  (
    'EMAIL',
    'Email notification channel',
    'system',
    'system'
  ),
  (
    'SMS',
    'SMS/text message notification channel',
    'system',
    'system'
  ) ON CONFLICT (channel_code) DO NOTHING;

-- Create notification_event_type_code table (code table pattern)
CREATE TABLE
  notify.notification_event_type_code (
    event_type_code VARCHAR(50) PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    is_mandatory BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_by VARCHAR(200)
  );

COMMENT ON TABLE notify.notification_event_type_code IS 'Code table for notification event types. Defines all valid events that can trigger notifications.';

COMMENT ON COLUMN notify.notification_event_type_code.event_type_code IS 'Event type code (e.g., PASSWORD_RESET, INVOICE_SENT). Primary key.';

COMMENT ON COLUMN notify.notification_event_type_code.description IS 'Human-readable description of the event type.';

COMMENT ON COLUMN notify.notification_event_type_code.is_mandatory IS 'Flag indicating if this event type is mandatory for all tenants.';

COMMENT ON COLUMN notify.notification_event_type_code.created_at IS 'Timestamp when the event type code was created.';

COMMENT ON COLUMN notify.notification_event_type_code.created_by IS 'User or process that created this record.';

COMMENT ON COLUMN notify.notification_event_type_code.updated_at IS 'Timestamp when the event type code was last updated.';

COMMENT ON COLUMN notify.notification_event_type_code.updated_by IS 'User or process that last updated this record.';

-- Seed event type codes
INSERT INTO
  notify.notification_event_type_code (
    event_type_code,
    description,
    is_mandatory,
    created_by,
    updated_by
  )
VALUES
  (
    'PASSWORD_RESET',
    'User password reset request',
    true,
    'system',
    'system'
  ),
  (
    'INVOICE_SENT',
    'Invoice sent to customer',
    false,
    'system',
    'system'
  ),
  (
    'ACCOUNT_CREATED',
    'New account creation',
    true,
    'system',
    'system'
  ) ON CONFLICT (event_type_code) DO NOTHING;

-- Create indexes for better query performance
CREATE INDEX idx_notification_channel_code_description ON notify.notification_channel_code (description);

CREATE INDEX idx_notification_event_type_code_description ON notify.notification_event_type_code (description);
