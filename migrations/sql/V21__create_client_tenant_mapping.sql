-- Create ClientTenantMapping table to link API Gateway client IDs to CSTAR tenants
-- This enables service-to-service authentication by mapping a client_id (from API Gateway)
-- to one or more tenants (from CSTAR), verified through OAuth2 client credentials exchange.
CREATE TABLE
  IF NOT EXISTS notify.client_tenant_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    client_id VARCHAR(255) NOT NULL,
    tenant_id UUID NOT NULL REFERENCES notify.tenant (id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    created_by VARCHAR(200) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_by VARCHAR(200),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
  );

-- Trigger to automatically update updated_at timestamp
CREATE TRIGGER trg_client_tenant_mapping_updated_at BEFORE
UPDATE ON notify.client_tenant_mapping FOR EACH ROW EXECUTE FUNCTION notify.set_updated_at ();

-- Partial unique index for soft-deleted records (WHERE clause not supported in constraints)
CREATE UNIQUE INDEX uk_client_tenant_mapping_partial ON notify.client_tenant_mapping (client_id, tenant_id)
WHERE
  is_deleted = FALSE;

-- Indexes for efficient lookups
CREATE INDEX idx_client_tenant_mapping_client_id ON notify.client_tenant_mapping (client_id)
WHERE
  is_deleted = FALSE
  AND is_active = TRUE;

CREATE INDEX idx_client_tenant_mapping_tenant_id ON notify.client_tenant_mapping (tenant_id)
WHERE
  is_deleted = FALSE
  AND is_active = TRUE;

CREATE INDEX idx_client_tenant_mapping_active ON notify.client_tenant_mapping (client_id, tenant_id)
WHERE
  is_deleted = FALSE
  AND is_active = TRUE;

-- Table comments
COMMENT ON TABLE notify.client_tenant_mapping IS 'Maps API Gateway client IDs to CSTAR tenants. Enables service-to-service access by linking OAuth2 client credentials (from API Portal) to authorized tenants. One client can access multiple tenants.';

COMMENT ON COLUMN notify.client_tenant_mapping.id IS 'Unique identifier for this mapping record.';

COMMENT ON COLUMN notify.client_tenant_mapping.client_id IS 'API Gateway client ID (issued via API Portal). Not a foreign key as the API Gateway is external.';

COMMENT ON COLUMN notify.client_tenant_mapping.tenant_id IS 'Foreign key to tenant.id. Identifies which CSTAR tenant this client_id can access. The tenant record is created automatically when the mapping is created if it does not already exist.';

COMMENT ON COLUMN notify.client_tenant_mapping.is_active IS 'Whether this mapping is currently active. Can be used to temporarily disable client access without deleting the record.';

COMMENT ON COLUMN notify.client_tenant_mapping.created_at IS 'Timestamp when the mapping was created (via link-client-to-tenants endpoint).';

COMMENT ON COLUMN notify.client_tenant_mapping.created_by IS 'User GUID of the admin who created this mapping. Serves as audit trail for who authorized the client.';

COMMENT ON COLUMN notify.client_tenant_mapping.updated_at IS 'Timestamp when the mapping was last updated. Automatically maintained by trigger.';

COMMENT ON COLUMN notify.client_tenant_mapping.updated_by IS 'User GUID of the admin who last updated this mapping.';

COMMENT ON COLUMN notify.client_tenant_mapping.is_deleted IS 'Soft delete flag. When true, the mapping is excluded from normal queries. Allows audit trail preservation.';
