-- Create template_engine_code table (code table pattern)
CREATE TABLE
  notify.template_engine_code (
    engine_code VARCHAR(50) PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_by VARCHAR(200)
  );

COMMENT ON TABLE notify.template_engine_code IS 'Code table for template rendering engines. Defines all valid engines for template rendering.';

COMMENT ON COLUMN notify.template_engine_code.engine_code IS 'Engine code (e.g., legacy_gc_notify, handlebars, mustache, ejs). Primary key.';

COMMENT ON COLUMN notify.template_engine_code.description IS 'Human-readable description of the engine.';

COMMENT ON COLUMN notify.template_engine_code.created_at IS 'Timestamp when the engine code was created.';

COMMENT ON COLUMN notify.template_engine_code.created_by IS 'User or process that created this record.';

COMMENT ON COLUMN notify.template_engine_code.updated_at IS 'Timestamp when the engine code was last updated.';

COMMENT ON COLUMN notify.template_engine_code.updated_by IS 'User or process that last updated this record.';

-- Seed engine codes
INSERT INTO
  notify.template_engine_code (engine_code, description, created_by, updated_by)
VALUES
  (
    'legacy_gc_notify',
    'Legacy GC Notify format with ((placeholder)) syntax',
    'system',
    'system'
  ),
  (
    'handlebars',
    'Handlebars template engine with full logic support',
    'system',
    'system'
  ),
  (
    'mustache',
    'Mustache template engine with logic-less syntax',
    'system',
    'system'
  ),
  (
    'ejs',
    'EJS template engine with full JavaScript support',
    'system',
    'system'
  ) ON CONFLICT (engine_code) DO NOTHING;

-- Create template table
CREATE TABLE
  notify.template (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    tenant_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    channel_code VARCHAR(20) NOT NULL,
    subject TEXT,
    body TEXT NOT NULL,
    engine_code VARCHAR(50) NOT NULL DEFAULT 'handlebars',
    version INTEGER NOT NULL DEFAULT 1,
    active BOOLEAN NOT NULL DEFAULT true,
    created_by VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_by VARCHAR(200) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    CONSTRAINT fk_template_channel FOREIGN KEY (channel_code) REFERENCES notify.notification_channel_code (channel_code),
    CONSTRAINT fk_template_engine FOREIGN KEY (engine_code) REFERENCES notify.template_engine_code (engine_code),
    CONSTRAINT unique_tenant_template_name UNIQUE (tenant_id, name)
  );

COMMENT ON TABLE notify.template IS 'Templates for notifications. Each template is scoped to a tenant and can be used to render notifications across different channels.';

COMMENT ON COLUMN notify.template.id IS 'Template ID (UUID). Primary key.';

COMMENT ON COLUMN notify.template.tenant_id IS 'Tenant ID (UUID). Identifies which tenant owns this template.';

COMMENT ON COLUMN notify.template.name IS 'Template name. Must be unique within the tenant.';

COMMENT ON COLUMN notify.template.description IS 'Optional description of what this template is for.';

COMMENT ON COLUMN notify.template.channel_code IS 'Foreign key to notification_channel_code. Defines which channel this template is for (EMAIL, SMS, etc.).';

COMMENT ON COLUMN notify.template.subject IS 'Email subject line. Only applicable for EMAIL templates.';

COMMENT ON COLUMN notify.template.body IS 'Template body content with placeholders.';

COMMENT ON COLUMN notify.template.engine_code IS 'Foreign key to template_engine_code. Defines which rendering engine to use.';

COMMENT ON COLUMN notify.template.version IS 'Version number of the template. Auto-increments with each update.';

COMMENT ON COLUMN notify.template.active IS 'Flag indicating if this is the active version of the template. Exactly one version per template should be active.';

COMMENT ON COLUMN notify.template.created_by IS 'User or process that created this template.';

COMMENT ON COLUMN notify.template.created_at IS 'Timestamp when the template was created.';

COMMENT ON COLUMN notify.template.updated_by IS 'User or process that last updated this template.';

COMMENT ON COLUMN notify.template.updated_at IS 'Timestamp when the template was last updated.';

-- Create template_version table for version history
CREATE TABLE
  notify.template_version (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    template_id UUID NOT NULL,
    version INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    channel_code VARCHAR(20) NOT NULL,
    subject TEXT,
    body TEXT NOT NULL,
    engine_code VARCHAR(50) NOT NULL,
    created_by VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    CONSTRAINT fk_template_version_template FOREIGN KEY (template_id) REFERENCES notify.template (id) ON DELETE CASCADE,
    CONSTRAINT fk_template_version_channel FOREIGN KEY (channel_code) REFERENCES notify.notification_channel_code (channel_code),
    CONSTRAINT fk_template_version_engine FOREIGN KEY (engine_code) REFERENCES notify.template_engine_code (engine_code),
    CONSTRAINT unique_template_version UNIQUE (template_id, version)
  );

COMMENT ON TABLE notify.template_version IS 'Historical versions of templates. Allows tracking changes and rolling back to previous versions.';

COMMENT ON COLUMN notify.template_version.id IS 'Version record ID (UUID). Primary key.';

COMMENT ON COLUMN notify.template_version.template_id IS 'Foreign key to template. Links to the template this version belongs to.';

COMMENT ON COLUMN notify.template_version.version IS 'Version number.';

COMMENT ON COLUMN notify.template_version.name IS 'Template name at this version.';

COMMENT ON COLUMN notify.template_version.description IS 'Template description at this version.';

COMMENT ON COLUMN notify.template_version.channel_code IS 'Channel code at this version.';

COMMENT ON COLUMN notify.template_version.subject IS 'Email subject at this version.';

COMMENT ON COLUMN notify.template_version.body IS 'Template body at this version.';

COMMENT ON COLUMN notify.template_version.engine_code IS 'Engine code at this version.';

COMMENT ON COLUMN notify.template_version.created_by IS 'User or process that created this version.';

COMMENT ON COLUMN notify.template_version.created_at IS 'Timestamp when this version was created.';

-- Create indexes for better query performance
CREATE INDEX idx_template_tenant_id ON notify.template (tenant_id);

CREATE INDEX idx_template_channel_code ON notify.template (channel_code);

CREATE INDEX idx_template_engine_code ON notify.template (engine_code);

CREATE INDEX idx_template_active ON notify.template (active);

CREATE INDEX idx_template_created_at ON notify.template (created_at);

CREATE INDEX idx_template_version_template_id ON notify.template_version (template_id);

CREATE INDEX idx_template_version_created_at ON notify.template_version (created_at);

-- Composite indexes for common query patterns
CREATE INDEX idx_template_tenant_active ON notify.template (tenant_id, active);

CREATE INDEX idx_template_version_template_version ON notify.template_version (template_id, version);
