-- V54: Pool of provisioned SMS phone numbers.
--
-- Numbers are provisioned centrally (by the platform team / SMS provider) into a pool. A row is:
--   available  - tenant_id IS NULL, free for any tenant to claim.
--   allocated  - tenant_id set, and the tenant sends all of its SMS from it.
--
-- A tenant claims a number the first time it configures SMS on an event: the SMS tab offers the
-- available pool (tenant_id IS NULL), and picking one allocates it. From then on the tenant holds
-- exactly that one number (uq_provisioned_phone_number_tenant below), every SMS event it
-- configures sends from it, and the tab shows it rather than a choice. Per-event numbers are not
-- supported.
--
-- Releasing a number back to the pool is an sso.notify_admin action, guarded in V54 so it can
-- only happen while the tenant has no event with SMS enabled. A number always travels through
-- the pool between holders - see notify.check_phone_number_allocation() below.
--
-- Numbers are stored in E.164 (+15551234567) so they compare cleanly against
-- recipient_safelist.recipient_normalized and the send path.
BEGIN;

CREATE TABLE
  notify.provisioned_phone_number (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    phone_number VARCHAR(20) NOT NULL,
    display_name VARCHAR(200),
    provider VARCHAR(50),
    tenant_id UUID,
    allocated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    updated_by VARCHAR(200),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT pk_provisioned_phone_number PRIMARY KEY (id),
    CONSTRAINT fk_provisioned_phone_number_tenant FOREIGN KEY (tenant_id) REFERENCES notify.tenant (id) ON DELETE SET NULL,
    CONSTRAINT chk_provisioned_phone_number_e164 CHECK (phone_number ~ '^\+[1-9][0-9]{1,14}$'),
    -- allocated_at is set exactly when the number is allocated to a tenant.
    CONSTRAINT chk_provisioned_phone_number_allocation CHECK (
      (
        tenant_id IS NULL
        AND allocated_at IS NULL
      )
      OR (
        tenant_id IS NOT NULL
        AND allocated_at IS NOT NULL
      )
    )
  );

-- A live number exists once. Partial so a retired (soft deleted) number does not block
-- re-provisioning the same number later.
CREATE UNIQUE INDEX uq_provisioned_phone_number_active ON notify.provisioned_phone_number (phone_number)
WHERE
  is_deleted = FALSE;

-- A tenant holds at most one live number. This is the rule that makes the SMS tab's from-number
-- a lookup rather than a choice. Partial so released and retired rows do not count.
CREATE UNIQUE INDEX uq_provisioned_phone_number_tenant ON notify.provisioned_phone_number (tenant_id)
WHERE
  is_deleted = FALSE
  AND tenant_id IS NOT NULL;

-- "Numbers still in the unallocated pool" - drives both the admin allocation screen and the
-- number picker a tenant sees on the SMS tab before it holds a number. Keyed on phone_number so
-- the picker's ordered listing is served straight from the index.
CREATE INDEX idx_provisioned_phone_number_available ON notify.provisioned_phone_number (phone_number)
WHERE
  is_deleted = FALSE
  AND tenant_id IS NULL;

COMMENT ON TABLE notify.provisioned_phone_number IS 'Pool of SMS phone numbers provisioned from the SMS provider. A row with tenant_id NULL is available for allocation; a row with tenant_id set is allocated to that tenant. A tenant holds at most one live number and all of its SMS events send from it.';

COMMENT ON COLUMN notify.provisioned_phone_number.id IS 'Unique identifier for the provisioned number.';

COMMENT ON COLUMN notify.provisioned_phone_number.phone_number IS 'The number in E.164 format (e.g. +12505551234). Unique across all non-deleted rows.';

COMMENT ON COLUMN notify.provisioned_phone_number.display_name IS 'Optional human-friendly label for the number (e.g. "Health Alerts - Victoria"). Shown in the admin UI and the from-number picker.';

COMMENT ON COLUMN notify.provisioned_phone_number.provider IS 'Informational name of the provider the number was provisioned from (e.g. twilio, gc_notify). Free text until a provider code table exists.';

COMMENT ON COLUMN notify.provisioned_phone_number.tenant_id IS 'Tenant the number is allocated to. NULL means the number is unallocated and offered in the pool picker. At most one live number per tenant, and a number can only move NULL <-> tenant, never tenant -> tenant. Set to NULL if the tenant is deleted, returning the number to the pool.';

COMMENT ON COLUMN notify.provisioned_phone_number.allocated_at IS 'Timestamp with timezone when the number was allocated to the current tenant. NULL while unallocated.';

COMMENT ON COLUMN notify.provisioned_phone_number.created_at IS 'Timestamp with timezone when the number was added to the pool.';

COMMENT ON COLUMN notify.provisioned_phone_number.created_by IS 'Identifier of the user or process that added this number.';

COMMENT ON COLUMN notify.provisioned_phone_number.updated_at IS 'Timestamp with timezone when the record was last updated. Maintained by the audit trigger.';

COMMENT ON COLUMN notify.provisioned_phone_number.updated_by IS 'Identifier of the user or process that last updated this record.';

COMMENT ON COLUMN notify.provisioned_phone_number.is_deleted IS 'Soft delete flag. When true the number is retired and excluded from the pool, the allocation list and the from-number picker.';

-- ---------------------------------------------------------------------------
-- Guard: a number always travels through the pool between holders
-- ---------------------------------------------------------------------------
-- Tenants claim numbers themselves from the available pool, so the only allocation the UI can
-- ever perform is NULL -> tenant. Handing a number straight from one tenant to another would
-- take it out from under the first tenant with no release step and no admin involvement, so it
-- is rejected here: a number must be released back to the pool (which V48's trigger only permits
-- when no event has SMS enabled) before another tenant can claim it.
--
-- Note for the claim path: allocation races between two tenants picking the same pool number are
-- NOT prevented by this trigger. The claim must be written as a conditional update and the
-- affected row count checked:
--   UPDATE notify.provisioned_phone_number
--      SET tenant_id = :tenant, allocated_at = now()
--    WHERE id = :id AND tenant_id IS NULL AND is_deleted = FALSE;
-- Zero rows updated means another tenant claimed it first; re-present the picker.
CREATE OR REPLACE FUNCTION notify.check_phone_number_allocation () RETURNS TRIGGER AS $$
BEGIN
  IF OLD.tenant_id IS NOT NULL
     AND NEW.tenant_id IS NOT NULL
     AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION
      'Phone number % cannot be transferred directly between tenants. Release it back to the pool first.',
      OLD.phone_number
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION notify.check_phone_number_allocation () IS 'Rejects moving a provisioned phone number directly from one tenant to another. A number must be released back to the pool (tenant_id NULL) before another tenant can claim it, so the release guard in V48 always gets a chance to run.';

CREATE TRIGGER trg_provisioned_phone_number_allocation BEFORE
UPDATE ON notify.provisioned_phone_number FOR EACH ROW
EXECUTE FUNCTION notify.check_phone_number_allocation ();

-- ---------------------------------------------------------------------------
-- Audit history (same shape and trigger function as recipient_safelist, V45)
-- ---------------------------------------------------------------------------
-- Allocation and release are administrative actions against a shared, finite resource, so every
-- change of hands is recorded. Releasing a number back to the pool is an UPDATE setting
-- tenant_id and allocated_at to NULL, so the history rows are the allocation trail: who gave the
-- number to which tenant, and who took it back.
CREATE TABLE
  notify.provisioned_phone_number_history (
    h_id UUID DEFAULT gen_random_uuid () NOT NULL PRIMARY KEY,
    target_row_id UUID NOT NULL,
    operation_type CHAR(1) NOT NULL,
    operation_user VARCHAR(200) DEFAULT CURRENT_USER NOT NULL,
    operation_executed_at TIMESTAMPTZ DEFAULT now () NOT NULL,
    data_after_operation JSONB NOT NULL
  );

CREATE INDEX idx_ppn_history_target_row ON notify.provisioned_phone_number_history (target_row_id);

CREATE INDEX idx_ppn_history_timestamp ON notify.provisioned_phone_number_history (operation_executed_at DESC);

CREATE INDEX idx_ppn_history_user ON notify.provisioned_phone_number_history (operation_user);

COMMENT ON TABLE notify.provisioned_phone_number_history IS 'Immutable audit log of changes to provisioned_phone_number. Each row is a full snapshot after INSERT/UPDATE, populated by the notify.audit_history() trigger. Allocation to a tenant and release back to the pool are both UPDATE rows.';

COMMENT ON COLUMN notify.provisioned_phone_number_history.h_id IS 'Unique identifier for this history record.';

COMMENT ON COLUMN notify.provisioned_phone_number_history.target_row_id IS 'provisioned_phone_number.id that was changed.';

COMMENT ON COLUMN notify.provisioned_phone_number_history.operation_type IS 'Type of operation: I=INSERT, U=UPDATE.';

COMMENT ON COLUMN notify.provisioned_phone_number_history.operation_user IS 'User who performed the operation (from app.current_user or the database user).';

COMMENT ON COLUMN notify.provisioned_phone_number_history.operation_executed_at IS 'Server timestamp when the operation occurred.';

COMMENT ON COLUMN notify.provisioned_phone_number_history.data_after_operation IS 'Complete JSON snapshot of the row after the operation.';

-- notify.audit_history() also maintains created_at/created_by/updated_at/updated_by, so this
-- table intentionally does not get a separate set_updated_at() trigger.
CREATE TRIGGER provisioned_phone_number_audit BEFORE INSERT
OR
UPDATE ON notify.provisioned_phone_number FOR EACH ROW
EXECUTE FUNCTION notify.audit_history ('provisioned_phone_number_history', 'id');

COMMIT;
