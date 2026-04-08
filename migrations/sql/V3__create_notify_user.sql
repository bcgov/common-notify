CREATE TABLE IF NOT EXISTS notify.notify_user (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name VARCHAR(200),
    email        VARCHAR(200),
    external_id  VARCHAR(200),
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    created_by   VARCHAR(200),
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_by   VARCHAR(200),
    is_deleted   BOOLEAN      NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE notify.notify_user IS 'Represents a user within the Notify system. Users authenticate via external identity providers and are mapped to this internal record.';
COMMENT ON COLUMN notify.notify_user.id IS 'Unique identifier for the Notify user.';
COMMENT ON COLUMN notify.notify_user.display_name IS 'Human-readable display name for the user, sourced from the identity provider.';
COMMENT ON COLUMN notify.notify_user.email IS 'Email address of the user.';
COMMENT ON COLUMN notify.notify_user.external_id IS 'ID from the identity provider or CSTAR system used to correlate the external identity.';
COMMENT ON COLUMN notify.notify_user.created_at IS 'Timestamp when the user record was created.';
COMMENT ON COLUMN notify.notify_user.created_by IS 'Identifier of the user or process that created this record.';
COMMENT ON COLUMN notify.notify_user.updated_at IS 'Timestamp when the user record was last updated.';
COMMENT ON COLUMN notify.notify_user.updated_by IS 'Identifier of the user or process that last updated this record.';
COMMENT ON COLUMN notify.notify_user.is_deleted IS 'Soft delete flag. When true, the user is considered inactive and excluded from normal queries.';
