CREATE TABLE
  IF NOT EXISTS notify.attachment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES notify.tenant(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_extension VARCHAR(50) NOT NULL,
    mime_type VARCHAR(255) NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_key VARCHAR(1024) NOT NULL UNIQUE,
    content_sha256 CHAR(64) NOT NULL,
    uploaded_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

DROP TRIGGER IF EXISTS trg_attachment_updated_at ON notify.attachment;
CREATE TRIGGER trg_attachment_updated_at BEFORE
UPDATE ON notify.attachment FOR EACH ROW EXECUTE FUNCTION notify.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_attachment_tenant_id ON notify.attachment (tenant_id);
CREATE INDEX IF NOT EXISTS idx_attachment_tenant_id_id ON notify.attachment (tenant_id, id);
