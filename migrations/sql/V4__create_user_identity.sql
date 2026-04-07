CREATE TABLE IF NOT EXISTS notify.user_identity (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID         NOT NULL REFERENCES notify.notify_user(id),
    provider_id      UUID         NOT NULL REFERENCES notify.identity_provider(id),
    subject          VARCHAR(200) NOT NULL,
    token_attributes JSONB,
    created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
    is_deleted       BOOLEAN      NOT NULL DEFAULT FALSE,
    UNIQUE (provider_id, subject)
);
