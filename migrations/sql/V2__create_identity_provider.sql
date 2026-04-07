CREATE TABLE IF NOT EXISTS notify.identity_provider (
    id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code      VARCHAR(50) NOT NULL UNIQUE,
    hint      VARCHAR(200),
    name      VARCHAR(200) NOT NULL,
    is_active BOOLEAN     NOT NULL DEFAULT TRUE
);
