-- Create email_logo_source_code table (code table pattern)
CREATE TABLE
  notify.email_logo_source_code (
    source_code VARCHAR(50) PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_by VARCHAR(200)
  );

COMMENT ON TABLE notify.email_logo_source_code IS 'Code table for email logo sources.';

COMMENT ON COLUMN notify.email_logo_source_code.source_code IS 'Email logo source code. Primary key.';

COMMENT ON COLUMN notify.email_logo_source_code.description IS 'Human-readable description of the email logo source.';

COMMENT ON COLUMN notify.email_logo_source_code.created_at IS 'Timestamp when the source code was created.';

COMMENT ON COLUMN notify.email_logo_source_code.created_by IS 'User or process that created this record.';

COMMENT ON COLUMN notify.email_logo_source_code.updated_at IS 'Timestamp when the source code was last updated.';

COMMENT ON COLUMN notify.email_logo_source_code.updated_by IS 'User or process that last updated this record.';

INSERT INTO
  notify.email_logo_source_code (source_code, description, created_by, updated_by)
VALUES
  ('SYSTEM', 'System-provided email logo', 'system', 'system'),
  ('TENANT', 'Tenant-provided email logo', 'system', 'system') ON CONFLICT (source_code) DO NOTHING;

-- Create email_logo_status_code table (code table pattern)
CREATE TABLE
  notify.email_logo_status_code (
    status_code VARCHAR(50) PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_by VARCHAR(200)
  );

COMMENT ON TABLE notify.email_logo_status_code IS 'Code table for email logo approval statuses.';

COMMENT ON COLUMN notify.email_logo_status_code.status_code IS 'Email logo approval status code. Primary key.';

COMMENT ON COLUMN notify.email_logo_status_code.description IS 'Human-readable description of the email logo approval status.';

COMMENT ON COLUMN notify.email_logo_status_code.created_at IS 'Timestamp when the status code was created.';

COMMENT ON COLUMN notify.email_logo_status_code.created_by IS 'User or process that created this record.';

COMMENT ON COLUMN notify.email_logo_status_code.updated_at IS 'Timestamp when the status code was last updated.';

COMMENT ON COLUMN notify.email_logo_status_code.updated_by IS 'User or process that last updated this record.';

INSERT INTO
  notify.email_logo_status_code (status_code, description, created_by, updated_by)
VALUES
  ('PENDING', 'Email logo is awaiting approval', 'system', 'system'),
  ('APPROVED', 'Email logo is approved for use', 'system', 'system'),
  ('REJECTED', 'Email logo was rejected', 'system', 'system') ON CONFLICT (status_code) DO NOTHING;

-- Create email_logo table
CREATE TABLE
  notify.email_logo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name VARCHAR,
    file_key VARCHAR,
    source_code VARCHAR NOT NULL,
    status_code VARCHAR NOT NULL,
    tenant_id UUID,
    submitted_by VARCHAR,
    approved_by VARCHAR,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_email_logo_source FOREIGN KEY (source_code) REFERENCES notify.email_logo_source_code (source_code),
    CONSTRAINT fk_email_logo_status FOREIGN KEY (status_code) REFERENCES notify.email_logo_status_code (status_code)
  );

COMMENT ON TABLE notify.email_logo IS 'Email logo metadata for system-provided and tenant-provided logos.';

COMMENT ON COLUMN notify.email_logo.id IS 'Email logo ID (UUID). Primary key.';

COMMENT ON COLUMN notify.email_logo.name IS 'Display name for the email logo.';

COMMENT ON COLUMN notify.email_logo.file_key IS 'Object storage key for the email logo file; not a URL.';

COMMENT ON COLUMN notify.email_logo.source_code IS 'Foreign key to email_logo_source_code. Identifies whether the logo is system-provided or tenant-provided.';

COMMENT ON COLUMN notify.email_logo.status_code IS 'Foreign key to email_logo_status_code. Identifies the logo approval status.';

COMMENT ON COLUMN notify.email_logo.tenant_id IS 'Tenant that owns the logo. Null for system-provided logos.';

COMMENT ON COLUMN notify.email_logo.submitted_by IS 'Identifier of the user or process that submitted the logo.';

COMMENT ON COLUMN notify.email_logo.approved_by IS 'Identifier of the user or process that approved or rejected the logo.';

COMMENT ON COLUMN notify.email_logo.created_at IS 'Timestamp when the email logo was created.';

COMMENT ON COLUMN notify.email_logo.updated_at IS 'Timestamp when the email logo was last updated.';

COMMENT ON COLUMN notify.email_logo.is_deleted IS 'Soft delete flag. When true, the email logo is considered inactive.';

ALTER TABLE notify.tenant_settings
  ADD COLUMN email_logo_id UUID;

ALTER TABLE notify.tenant_settings
  ADD CONSTRAINT fk_tenant_settings_email_logo FOREIGN KEY (email_logo_id) REFERENCES notify.email_logo (id);

COMMENT ON COLUMN notify.tenant_settings.email_logo_id IS 'Optional email logo selected for this tenant.';
