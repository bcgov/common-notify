-- V41: Per-tenant settings.
--
-- Holds tenant-scoped configuration, one row per tenant. Starts with a single
-- setting (the alert email address) and is intended to grow: future scalar
-- settings (header/logo image URL, from-name, footer text, etc.) are added here
-- as additional columns as those features land.
CREATE TABLE IF NOT EXISTS
  notify.tenant_settings (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    tenant_id UUID NOT NULL,
    alert_email VARCHAR(320),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    updated_by VARCHAR(200),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT pk_tenant_settings PRIMARY KEY (id),
    CONSTRAINT uq_tenant_settings_tenant UNIQUE (tenant_id),
    CONSTRAINT fk_tenant_settings_tenant FOREIGN KEY (tenant_id) REFERENCES notify.tenant (id) ON DELETE CASCADE
  );

CREATE TRIGGER trg_tenant_settings_updated_at
    BEFORE UPDATE ON notify.tenant_settings
    FOR EACH ROW EXECUTE FUNCTION notify.set_updated_at();

CREATE INDEX idx_tenant_settings_tenant ON notify.tenant_settings (tenant_id) WHERE is_deleted = FALSE;

COMMENT ON TABLE notify.tenant_settings IS 'Tenant-scoped configuration settings, one row per tenant. Column-per-setting; grows over time (alert email, header image, from-name, etc.).';
COMMENT ON COLUMN notify.tenant_settings.id IS 'Unique identifier for the tenant settings row.';
COMMENT ON COLUMN notify.tenant_settings.tenant_id IS 'The tenant these settings belong to. Unique: at most one settings row per tenant.';
COMMENT ON COLUMN notify.tenant_settings.alert_email IS 'Email address that system and limit alerts for this tenant are sent to. Nullable when no alert recipient is configured.';
COMMENT ON COLUMN notify.tenant_settings.created_at IS 'Timestamp with timezone when the settings record was created.';
COMMENT ON COLUMN notify.tenant_settings.created_by IS 'Identifier of the user or process that created this record.';
COMMENT ON COLUMN notify.tenant_settings.updated_at IS 'Timestamp with timezone when the settings record was last updated. Automatically maintained by trg_tenant_settings_updated_at trigger.';
COMMENT ON COLUMN notify.tenant_settings.updated_by IS 'Identifier of the user or process that last updated this record.';
COMMENT ON COLUMN notify.tenant_settings.is_deleted IS 'Soft delete flag. When true, the settings row is considered inactive and excluded from normal queries.';
