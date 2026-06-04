-- ============================================================================
-- Feature Flags Table Migration
-- Purpose: Enable dynamic feature toggles without redeployment
-- Supports global flags (tenant_id = NULL) and per-tenant overrides
-- Resolution strategy: tenant-specific flag > global flag > default false
-- ============================================================================
BEGIN;

-- ============================================================================
-- Create feature_flag_code lookup table (valid codes)
-- ============================================================================
CREATE TABLE
  IF NOT EXISTS notify.feature_flag_code (
    code VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_by VARCHAR(200),
    CONSTRAINT feature_flag_code_pkey PRIMARY KEY (code)
  );

-- ============================================================================
-- Lookup Table Comments
-- ============================================================================
COMMENT ON TABLE notify.feature_flag_code IS 'Lookup table for valid feature flag codes. Defines all available features that can be toggled. Prevents typos and ensures consistency across backend/frontend. Follows notification_channel_code pattern.';

COMMENT ON COLUMN notify.feature_flag_code.code IS 'Unique feature code identifier (kebab-case convention, e.g. sms_notifications, sse_notifications). Used by backend/frontend to check if feature is enabled. Primary key ensures one definition per code.';

COMMENT ON COLUMN notify.feature_flag_code.display_name IS 'Human-readable name for this feature (e.g. SMS Notifications, Server-Sent Events). Displayed in admin UI for clarity.';

COMMENT ON COLUMN notify.feature_flag_code.description IS 'Detailed description of what this feature does and its purpose. Used in admin UI for documentation and context.';

COMMENT ON COLUMN notify.feature_flag_code.created_at IS 'Timestamp when this code definition was created. Automatically set to NOW() on insert.';

COMMENT ON COLUMN notify.feature_flag_code.created_by IS 'Identifier of user or process that created this code definition.';

COMMENT ON COLUMN notify.feature_flag_code.updated_at IS 'Timestamp when this code definition was last updated. Automatically maintained by the trg_feature_flag_code_updated_at trigger.';

COMMENT ON COLUMN notify.feature_flag_code.updated_by IS 'Identifier of user or process that last updated this code definition.';

-- ============================================================================
-- Trigger for feature_flag_code updated_at timestamp
-- ============================================================================
CREATE TRIGGER trg_feature_flag_code_updated_at BEFORE
UPDATE ON notify.feature_flag_code FOR EACH ROW EXECUTE FUNCTION notify.set_updated_at ();

-- ============================================================================
-- Create feature_flag table (instances of flags per tenant/global)
-- ============================================================================
CREATE TABLE
  IF NOT EXISTS notify.feature_flag (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    code VARCHAR(255) NOT NULL REFERENCES notify.feature_flag_code (code),
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    tenant_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    created_by VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_by VARCHAR(255),
    CONSTRAINT fk_feature_flag_tenant_id FOREIGN KEY (tenant_id) REFERENCES notify.tenant (id) ON DELETE CASCADE,
    CONSTRAINT uq_feature_flag_code_tenant UNIQUE (code, tenant_id)
  );

-- ============================================================================
-- Feature Flag Table Comments
-- ============================================================================
COMMENT ON TABLE notify.feature_flag IS 'Feature flags table - enables/disables features dynamically without redeployment. Supports global flags (tenant_id = NULL) and per-tenant overrides. Resolution strategy: tenant-specific flag > global flag > default false.';

COMMENT ON COLUMN notify.feature_flag.id IS 'Unique identifier (UUID) for this feature flag record.';

COMMENT ON COLUMN notify.feature_flag.code IS 'Foreign key to feature_flag_code lookup table. Defines which feature this flag controls. Ensures only valid feature codes are used.';

COMMENT ON COLUMN notify.feature_flag.enabled IS 'Boolean flag indicating if this feature is currently enabled (true) or disabled (false). Defaults to false (safer: disabled by default).';

COMMENT ON COLUMN notify.feature_flag.tenant_id IS 'Foreign key to tenant table. NULL = global flag applies to all tenants. Non-NULL = tenant-specific override. Cascade delete if tenant is deleted.';

COMMENT ON COLUMN notify.feature_flag.created_at IS 'Timestamp (with timezone) when this feature flag record was created. Automatically set to NOW() on insert.';

COMMENT ON COLUMN notify.feature_flag.created_by IS 'Identifier (username, UUID, email) of the user or process that created this record. Useful for audit trail and change tracking.';

COMMENT ON COLUMN notify.feature_flag.updated_at IS 'Timestamp (with timezone) when this feature flag was last updated. Automatically maintained by the trg_feature_flag_updated_at trigger.';

COMMENT ON COLUMN notify.feature_flag.updated_by IS 'Identifier (username, UUID, email) of the user or process that last updated this record. Useful for audit trail and change tracking.';

-- ============================================================================
-- Indexes for Performance
-- ============================================================================
-- Fast lookup by code (most common query: "is this feature enabled?")
CREATE INDEX idx_feature_flag_code ON notify.feature_flag (code);

-- Fast lookup of tenant-specific overrides
CREATE INDEX idx_feature_flag_tenant_code ON notify.feature_flag (tenant_id, code);

-- Fast lookup of all global flags (where tenant_id IS NULL)
CREATE INDEX idx_feature_flag_global ON notify.feature_flag (code)
WHERE
  tenant_id IS NULL;

-- Fast lookup of all tenant overrides
CREATE INDEX idx_feature_flag_tenant_all ON notify.feature_flag (tenant_id);

-- ============================================================================
-- Trigger for automatic updated_at timestamp
-- ============================================================================
-- Uses existing set_updated_at() function from the database
-- If it doesn't exist, it will be created by other migrations
CREATE TRIGGER trg_feature_flag_updated_at BEFORE
UPDATE ON notify.feature_flag FOR EACH ROW EXECUTE FUNCTION notify.set_updated_at ();

-- ============================================================================
-- Seed feature flag codes (valid feature codes - master list)
-- ============================================================================
INSERT INTO
  notify.feature_flag_code (
    code,
    display_name,
    description,
    created_by,
    updated_by
  )
VALUES
  (
    'sms_notifications',
    'SMS Notifications',
    'Enable/disable SMS message delivery channel. Used to control access while SMS licensing is being configured.',
    'migration',
    'migration'
  ),
  (
    'sse_notifications',
    'Server-Sent Events',
    'Enable/disable real-time SSE (Server-Sent Events) notification status updates to connected clients.',
    'migration',
    'migration'
  ) ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- Seed initial global feature flags (instances for all tenants)
-- ============================================================================
-- SMS: Disabled by default (licensing restrictions)
INSERT INTO
  notify.feature_flag (code, enabled, tenant_id, created_by, updated_by)
VALUES
  (
    'sms_notifications',
    FALSE,
    NULL,
    'migration',
    'migration'
  ) ON CONFLICT (code, tenant_id) DO NOTHING;

-- SSE: Enabled by default (already working)
INSERT INTO
  notify.feature_flag (code, enabled, tenant_id, created_by, updated_by)
VALUES
  (
    'sse_notifications',
    TRUE,
    NULL,
    'migration',
    'migration'
  ) ON CONFLICT (code, tenant_id) DO NOTHING;

COMMIT;
