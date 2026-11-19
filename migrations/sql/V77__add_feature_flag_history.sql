-- ============================================================================
-- Feature Flag History
--
-- One row per change to a feature_flag: its creation, and every time it is
-- enabled or disabled. Written in the same transaction as the change, so the
-- history cannot disagree with the flag. Rows are never updated.
--
-- feature_flag.updated_by/updated_at only hold the latest change; this table
-- keeps all of them so admins can see who turned a flag on or off, and when.
-- History starts with this migration: earlier changes were never recorded.
--
-- No foreign keys. An audit trail has to outlive what it describes: a flag is
-- deleted with its tenant (feature_flag.tenant_id cascades), and its history must
-- not go with it - nor block the delete. code and tenant_id are copied onto each
-- row so it still reads correctly once the flag is gone.
-- ============================================================================
BEGIN;

CREATE TABLE
  IF NOT EXISTS notify.feature_flag_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    feature_flag_id UUID NOT NULL,
    code VARCHAR(255) NOT NULL,
    tenant_id UUID,
    enabled BOOLEAN NOT NULL,
    created_by VARCHAR(200) NOT NULL,
    created_by_name VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
  );

COMMENT ON TABLE notify.feature_flag_history IS 'Audit trail of feature flag changes: one row when a flag is created and one each time it is enabled or disabled. Append-only.';

COMMENT ON COLUMN notify.feature_flag_history.feature_flag_id IS 'The feature_flag row that changed. Not a foreign key: the row may since have been deleted.';

COMMENT ON COLUMN notify.feature_flag_history.code IS 'feature_flag.code at the time of the change, so the row is readable after the flag is deleted.';

COMMENT ON COLUMN notify.feature_flag_history.tenant_id IS 'feature_flag.tenant_id at the time of the change; NULL for a global flag. Not a foreign key: the tenant may since have been deleted.';

COMMENT ON COLUMN notify.feature_flag_history.enabled IS 'Value of feature_flag.enabled after the change. A row is only written when the value changes, so the value before was the opposite.';

COMMENT ON COLUMN notify.feature_flag_history.created_by IS 'Stable identifier of the user who made the change (JWT preferred_username), matching feature_flag.updated_by.';

COMMENT ON COLUMN notify.feature_flag_history.created_by_name IS 'Display name of the user at the time of the change (JWT display_name), for showing in the admin UI. NULL if the token carried none.';

COMMENT ON COLUMN notify.feature_flag_history.created_at IS 'When the change was made.';

CREATE INDEX idx_feature_flag_history_flag_created_at ON notify.feature_flag_history (feature_flag_id, created_at DESC);

COMMIT;
