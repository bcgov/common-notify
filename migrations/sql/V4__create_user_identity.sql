CREATE TABLE IF NOT EXISTS notify.user_identity (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID         NOT NULL REFERENCES notify.notify_user(id),
    provider_id      UUID         NOT NULL REFERENCES notify.identity_provider(id),
    subject          VARCHAR(200) NOT NULL,
    token_attributes JSONB,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    is_deleted       BOOLEAN      NOT NULL DEFAULT FALSE,
    UNIQUE (provider_id, subject)
);

CREATE INDEX idx_user_identity_user_id ON notify.user_identity (user_id);
CREATE INDEX idx_user_identity_provider_id ON notify.user_identity (provider_id);
CREATE INDEX idx_user_identity_active ON notify.user_identity (id) WHERE is_deleted = FALSE;

COMMENT ON TABLE notify.user_identity IS 'Links an external identity provider account to an internal Notify user. A single Notify user may have multiple identity links across different providers.';
COMMENT ON COLUMN notify.user_identity.id IS 'Unique identifier for the identity mapping record.';
COMMENT ON COLUMN notify.user_identity.user_id IS 'Reference to the internal Notify user this identity belongs to.';
COMMENT ON COLUMN notify.user_identity.provider_id IS 'Reference to the identity provider used for authentication.';
COMMENT ON COLUMN notify.user_identity.subject IS 'Unique subject identifier issued by the identity provider for this user (e.g. the sub claim in a JWT).';
COMMENT ON COLUMN notify.user_identity.token_attributes IS 'Additional identity claims or attributes returned by the provider stored as JSONB (e.g. roles, groups).';
COMMENT ON COLUMN notify.user_identity.created_at IS 'Timestamp with timezone when this identity link was created.';
COMMENT ON COLUMN notify.user_identity.is_deleted IS 'Soft delete flag. When true, this identity link is considered inactive.';
COMMENT ON CONSTRAINT user_identity_provider_id_subject_key ON notify.user_identity IS 'Ensures a subject identifier is unique per identity provider, preventing duplicate identity mappings.';
