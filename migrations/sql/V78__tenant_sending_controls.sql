-- ============================================================================
-- Tenant sending controls
--
-- A NOTIFY_ADMIN can stop a tenant sending. tenant.status already holds
-- 'active' / 'disabled'; these columns record why and by whom for the current
-- state, and tenant_sending_history keeps every change.
--
-- The history has no foreign key, matching feature_flag_history: an audit trail
-- must outlive what it describes and must not block a delete.
-- ============================================================================
BEGIN;

ALTER TABLE notify.tenant
  ADD COLUMN IF NOT EXISTS disabled_reason VARCHAR(500),
  ADD COLUMN IF NOT EXISTS disabled_by VARCHAR(200),
  ADD COLUMN IF NOT EXISTS disabled_by_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

COMMENT ON COLUMN notify.tenant.disabled_reason IS 'Why an admin disabled sending for this tenant. Shown to admins and in the error a rejected send returns. NULL while status is active.';
COMMENT ON COLUMN notify.tenant.disabled_by IS 'Stable identifier of the admin who disabled sending (JWT preferred_username). NULL while status is active.';
COMMENT ON COLUMN notify.tenant.disabled_by_name IS 'Display name of that admin at the time. NULL while status is active or if the token carried none.';
COMMENT ON COLUMN notify.tenant.disabled_at IS 'When sending was disabled. NULL while status is active.';

CREATE TABLE
  IF NOT EXISTS notify.tenant_sending_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    tenant_id UUID NOT NULL,
    enabled BOOLEAN NOT NULL,
    reason VARCHAR(500),
    created_by VARCHAR(200) NOT NULL,
    created_by_name VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
  );

COMMENT ON TABLE notify.tenant_sending_history IS 'Audit trail of an admin enabling or disabling sending for a tenant. One row per change, written in the same transaction as the change. Append-only.';
COMMENT ON COLUMN notify.tenant_sending_history.tenant_id IS 'The tenant that changed. Not a foreign key: the tenant may since have been deleted.';
COMMENT ON COLUMN notify.tenant_sending_history.enabled IS 'Whether the tenant could send after the change.';
COMMENT ON COLUMN notify.tenant_sending_history.reason IS 'The reason given when disabling. NULL when enabling.';
COMMENT ON COLUMN notify.tenant_sending_history.created_by IS 'Stable identifier of the admin who made the change (JWT preferred_username).';
COMMENT ON COLUMN notify.tenant_sending_history.created_by_name IS 'Display name of the admin at the time of the change. NULL if the token carried none.';
COMMENT ON COLUMN notify.tenant_sending_history.created_at IS 'When the change was made.';

CREATE INDEX IF NOT EXISTS idx_tenant_sending_history_tenant_created_at ON notify.tenant_sending_history (tenant_id, created_at DESC);

COMMIT;
