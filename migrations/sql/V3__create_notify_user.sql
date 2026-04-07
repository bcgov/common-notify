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
