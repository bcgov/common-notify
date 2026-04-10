CREATE TABLE IF NOT EXISTS notify.identity_provider (
    id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code      VARCHAR(50) NOT NULL UNIQUE,
    hint      VARCHAR(200),
    name      VARCHAR(200) NOT NULL,
    is_active BOOLEAN     NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE notify.identity_provider IS 'Stores the external authentication providers supported by the system (e.g. IDIR, BCeID).';
COMMENT ON COLUMN notify.identity_provider.id IS 'Unique identifier for the identity provider.';
COMMENT ON COLUMN notify.identity_provider.code IS 'Short code representing the provider. Sample values: IDIR, BCEID_BASIC, BCEID_BUSINESS.';
COMMENT ON COLUMN notify.identity_provider.hint IS 'Login hint passed to the identity provider to guide the authentication flow.';
COMMENT ON COLUMN notify.identity_provider.name IS 'Human-readable name of the provider (e.g. IDIR, BCeID Basic, BCeID Business).';
COMMENT ON COLUMN notify.identity_provider.is_active IS 'Indicates whether this identity provider is currently active and available for authentication.';
