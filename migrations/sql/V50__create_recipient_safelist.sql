-- V47: Per-tenant recipient safelist ("whitelist").
--
-- A non-production guardrail, modelled on GC Notify's service_safelist. In any environment
-- where the 'recipient_safelist' feature flag is enabled (PR, DEV and TEST — never PROD), the
-- send path only accepts notifications addressed to recipients listed here for the matching
-- channel. Enforcement is fail-closed: a tenant with no entries cannot send at all, so real
-- people can never be contacted from a test environment by accident.
--
-- Two representations of each recipient are stored:
--   recipient            - exactly what the administrator entered, shown back in the UI.
--   recipient_normalized - the canonical form the send path compares against
--                          (lowercased/trimmed email, E.164 phone number). Uniqueness and
--                          lookups use this column.
--
-- Rows are soft deleted so that removing and re-adding a recipient keeps a full audit trail.
CREATE TABLE
  notify.recipient_safelist (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    tenant_id UUID NOT NULL,
    channel_code VARCHAR(20) NOT NULL,
    recipient VARCHAR(320) NOT NULL,
    recipient_normalized VARCHAR(320) NOT NULL,
    label VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    updated_by VARCHAR(200),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT pk_recipient_safelist PRIMARY KEY (id),
    CONSTRAINT fk_recipient_safelist_tenant FOREIGN KEY (tenant_id) REFERENCES notify.tenant (id) ON DELETE CASCADE,
    CONSTRAINT fk_recipient_safelist_channel FOREIGN KEY (channel_code) REFERENCES notify.notification_channel_code (channel_code),
    CONSTRAINT chk_recipient_safelist_channel CHECK (channel_code IN ('EMAIL', 'SMS')),
    CONSTRAINT chk_recipient_safelist_recipient CHECK (length(btrim(recipient)) > 0),
    CONSTRAINT chk_recipient_safelist_normalized CHECK (
      recipient_normalized = btrim(recipient_normalized)
      AND length(recipient_normalized) > 0
    )
  );

-- Active entries are unique per (tenant, channel, normalized recipient). Partial so a soft
-- deleted entry does not block re-adding the same recipient later.
CREATE UNIQUE INDEX uq_recipient_safelist_active ON notify.recipient_safelist (tenant_id, channel_code, recipient_normalized)
WHERE
  is_deleted = FALSE;

-- UI listing: all active entries for a tenant. The unique index above already serves the
-- send-path lookup (tenant_id, channel_code, recipient_normalized).
CREATE INDEX idx_recipient_safelist_tenant ON notify.recipient_safelist (tenant_id)
WHERE
  is_deleted = FALSE;

COMMENT ON TABLE notify.recipient_safelist IS 'Per-tenant list of recipients that may be sent to in non-production environments, where the recipient_safelist feature flag is enabled. Equivalent to GC Notify service_safelist. Ignored in PROD, where the flag is off.';

COMMENT ON COLUMN notify.recipient_safelist.id IS 'Unique identifier for the safelist entry.';

COMMENT ON COLUMN notify.recipient_safelist.tenant_id IS 'Tenant this safelist entry belongs to. Cascade deleted with the tenant.';

COMMENT ON COLUMN notify.recipient_safelist.channel_code IS 'Channel the entry applies to (EMAIL or SMS). An email address safelisted for EMAIL does not permit SMS sends.';

COMMENT ON COLUMN notify.recipient_safelist.recipient IS 'Recipient exactly as entered by the administrator (email address or phone number). Displayed in the UI.';

COMMENT ON COLUMN notify.recipient_safelist.recipient_normalized IS 'Canonical form used for comparison by the send path: lowercased/trimmed for EMAIL, E.164 for SMS.';

COMMENT ON COLUMN notify.recipient_safelist.label IS 'Optional free-text label describing the entry (e.g. "QA mailbox"). Nullable.';

COMMENT ON COLUMN notify.recipient_safelist.created_at IS 'Timestamp with timezone when the entry was created.';

COMMENT ON COLUMN notify.recipient_safelist.created_by IS 'Identifier of the user or process that added this entry.';

COMMENT ON COLUMN notify.recipient_safelist.updated_at IS 'Timestamp with timezone when the entry was last updated. Maintained by the audit trigger.';

COMMENT ON COLUMN notify.recipient_safelist.updated_by IS 'Identifier of the user or process that last updated this entry.';

COMMENT ON COLUMN notify.recipient_safelist.is_deleted IS 'Soft delete flag. Excluded from the active unique index and from send-path lookups when true.';

-- ---------------------------------------------------------------------------
-- Audit history (same shape and trigger function as notification_request_history, V29)
-- ---------------------------------------------------------------------------
CREATE TABLE
  notify.recipient_safelist_history (
    h_id UUID DEFAULT gen_random_uuid () NOT NULL PRIMARY KEY,
    target_row_id UUID NOT NULL,
    operation_type CHAR(1) NOT NULL,
    operation_user VARCHAR(200) DEFAULT CURRENT_USER NOT NULL,
    operation_executed_at TIMESTAMPTZ DEFAULT now () NOT NULL,
    data_after_operation JSONB NOT NULL
  );

CREATE INDEX idx_rs_history_target_row ON notify.recipient_safelist_history (target_row_id);

CREATE INDEX idx_rs_history_timestamp ON notify.recipient_safelist_history (operation_executed_at DESC);

CREATE INDEX idx_rs_history_user ON notify.recipient_safelist_history (operation_user);

COMMENT ON TABLE notify.recipient_safelist_history IS 'Immutable audit log of changes to recipient_safelist. Each row is a full snapshot after INSERT/UPDATE, populated by the notify.audit_history() trigger. Removals are soft deletes and are therefore recorded as UPDATE rows.';

COMMENT ON COLUMN notify.recipient_safelist_history.h_id IS 'Unique identifier for this history record.';

COMMENT ON COLUMN notify.recipient_safelist_history.target_row_id IS 'recipient_safelist.id that was changed.';

COMMENT ON COLUMN notify.recipient_safelist_history.operation_type IS 'Type of operation: I=INSERT, U=UPDATE.';

COMMENT ON COLUMN notify.recipient_safelist_history.operation_user IS 'User who performed the operation (from app.current_user or the database user).';

COMMENT ON COLUMN notify.recipient_safelist_history.operation_executed_at IS 'Server timestamp when the operation occurred.';

COMMENT ON COLUMN notify.recipient_safelist_history.data_after_operation IS 'Complete JSON snapshot of the row after the operation.';

-- notify.audit_history() also maintains created_at/created_by/updated_at/updated_by, so this
-- table intentionally does not get a separate set_updated_at() trigger.
CREATE TRIGGER recipient_safelist_audit BEFORE INSERT
OR
UPDATE ON notify.recipient_safelist FOR EACH ROW
EXECUTE FUNCTION notify.audit_history ('recipient_safelist_history', 'id');
