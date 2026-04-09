CREATE OR REPLACE FUNCTION notify.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION notify.set_updated_at() IS 'Reusable trigger function that automatically sets updated_at to the current timestamp on every row update. Add this trigger to any table that has an updated_at column.';

CREATE TABLE IF NOT EXISTS notify.notify_user (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name VARCHAR(200),
    email        VARCHAR(200) UNIQUE,
    external_id  VARCHAR(200),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by   VARCHAR(200),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by   VARCHAR(200),
    is_deleted   BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TRIGGER trg_notify_user_updated_at
    BEFORE UPDATE ON notify.notify_user
    FOR EACH ROW EXECUTE FUNCTION notify.set_updated_at();

CREATE INDEX idx_notify_user_active ON notify.notify_user (id) WHERE is_deleted = FALSE;

COMMENT ON TABLE notify.notify_user IS 'Represents a user within the Notify system. Users authenticate via external identity providers and are mapped to this internal record.';
COMMENT ON COLUMN notify.notify_user.id IS 'Unique identifier for the Notify user.';
COMMENT ON COLUMN notify.notify_user.display_name IS 'Human-readable display name for the user, sourced from the identity provider.';
COMMENT ON COLUMN notify.notify_user.email IS 'Email address of the user. Must be unique across all Notify users.';
COMMENT ON COLUMN notify.notify_user.external_id IS 'ID from the identity provider or CSTAR system used to correlate the external identity.';
COMMENT ON COLUMN notify.notify_user.created_at IS 'Timestamp with timezone when the user record was created.';
COMMENT ON COLUMN notify.notify_user.created_by IS 'Identifier of the user or process that created this record.';
COMMENT ON COLUMN notify.notify_user.updated_at IS 'Timestamp with timezone when the user record was last updated. Automatically maintained by trg_notify_user_updated_at trigger.';
COMMENT ON COLUMN notify.notify_user.updated_by IS 'Identifier of the user or process that last updated this record.';
COMMENT ON COLUMN notify.notify_user.is_deleted IS 'Soft delete flag. When true, the user is considered inactive and excluded from normal queries.';
