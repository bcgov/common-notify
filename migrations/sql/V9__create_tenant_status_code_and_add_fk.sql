-- Create tenant_status_code table (code table pattern)
CREATE TABLE
  notify.tenant_status_code (
    code VARCHAR(20) PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_by VARCHAR(200)
  );

COMMENT ON TABLE notify.tenant_status_code IS 'Code table for tenant status values. Defines all valid statuses for tenants.';

COMMENT ON COLUMN notify.tenant_status_code.code IS 'Status code (e.g., active, disabled). Primary key.';

COMMENT ON COLUMN notify.tenant_status_code.description IS 'Human-readable description of the status.';

COMMENT ON COLUMN notify.tenant_status_code.created_at IS 'Timestamp when the status code was created.';

COMMENT ON COLUMN notify.tenant_status_code.created_by IS 'User or process that created this record.';

COMMENT ON COLUMN notify.tenant_status_code.updated_at IS 'Timestamp when the status code was last updated.';

COMMENT ON COLUMN notify.tenant_status_code.updated_by IS 'User or process that last updated this record.';

-- Seed status codes (based on existing check constraint values)
INSERT INTO
  notify.tenant_status_code (code, description, created_by, updated_by)
VALUES
  (
    'active',
    'Tenant is active and can send notifications',
    'system',
    'system'
  ),
  (
    'disabled',
    'Tenant is disabled and cannot send notifications',
    'system',
    'system'
  ) ON CONFLICT (code) DO NOTHING;

-- Drop the check constraint from tenant table
ALTER TABLE notify.tenant
DROP CONSTRAINT IF EXISTS tenant_status_check;

-- Add foreign key constraint to tenant_status_code
ALTER TABLE notify.tenant ADD CONSTRAINT fk_tenant_status FOREIGN KEY (status) REFERENCES notify.tenant_status_code (code) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create index for status lookups (helps with FK checks)
CREATE INDEX idx_tenant_status ON notify.tenant (status);
