CREATE TABLE IF NOT EXISTS notify.tenant (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(200),
    name        VARCHAR(200) NOT NULL,
    slug        VARCHAR(200) NOT NULL UNIQUE,
    status      VARCHAR(50)  NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by  VARCHAR(200),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_by  VARCHAR(200),
    is_deleted  BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TRIGGER trg_tenant_updated_at
    BEFORE UPDATE ON notify.tenant
    FOR EACH ROW EXECUTE FUNCTION notify.set_updated_at();

CREATE INDEX idx_tenant_slug ON notify.tenant (slug) WHERE is_deleted = FALSE;
CREATE INDEX idx_tenant_active ON notify.tenant (id) WHERE is_deleted = FALSE;

COMMENT ON TABLE notify.tenant IS 'Represents an organization or service using BC Notify. All data in the system is scoped under a tenant.';
COMMENT ON COLUMN notify.tenant.id IS 'Unique identifier for the tenant.';
COMMENT ON COLUMN notify.tenant.external_id IS 'External identifier from CSTAR or Gateway used to correlate this tenant with external systems.';
COMMENT ON COLUMN notify.tenant.name IS 'Human-readable name of the tenant organization (e.g. Ministry of Health).';
COMMENT ON COLUMN notify.tenant.slug IS 'URL-friendly unique identifier for the tenant (e.g. ministry-of-health). Must be unique across all tenants.';
COMMENT ON COLUMN notify.tenant.status IS 'Current status of the tenant. Allowed values: active, disabled.';
COMMENT ON COLUMN notify.tenant.created_at IS 'Timestamp with timezone when the tenant record was created.';
COMMENT ON COLUMN notify.tenant.created_by IS 'Identifier of the user or process that created this record.';
COMMENT ON COLUMN notify.tenant.updated_at IS 'Timestamp with timezone when the tenant record was last updated. Automatically maintained by trg_tenant_updated_at trigger.';
COMMENT ON COLUMN notify.tenant.updated_by IS 'Identifier of the user or process that last updated this record.';
COMMENT ON COLUMN notify.tenant.is_deleted IS 'Soft delete flag. When true, the tenant is considered inactive and excluded from normal queries.';
