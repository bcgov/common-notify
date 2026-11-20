-- ============================================================================
-- Tenant requests
--
-- Something a tenant asks for that a Notify admin must approve: an SMS number,
-- for one. Every kind of request shares one lifecycle, kept here:
--
--   pending -> approved -> released
--           -> rejected (with a reason)
--           -> cancelled (by the tenant, before a decision)
--
-- What approving grants, and what releasing takes back, differs by type. Each
-- type keeps its own details in a table of its own, keyed by tenant_request.id
-- (e.g. tenant_request_sms_number), and seeds its code into
-- tenant_request_type_code in the migration that adds it.
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- Code tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notify.tenant_request_type_code (
  code VARCHAR(30) PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  created_by VARCHAR(200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  updated_by VARCHAR(200)
);

COMMENT ON TABLE notify.tenant_request_type_code IS 'Code table of the things a tenant can ask a Notify admin for. Each type''s migration seeds its own code.';

CREATE TABLE IF NOT EXISTS notify.tenant_request_status_code (
  code VARCHAR(20) PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  created_by VARCHAR(200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  updated_by VARCHAR(200)
);

COMMENT ON TABLE notify.tenant_request_status_code IS 'Code table of the statuses of a tenant request.';

INSERT INTO notify.tenant_request_status_code (code, description, created_by, updated_by)
VALUES
  ('pending', 'Waiting for a Notify admin to decide', 'migration', 'migration'),
  ('approved', 'Approved, and what was asked for granted', 'migration', 'migration'),
  ('rejected', 'Rejected by a Notify admin', 'migration', 'migration'),
  ('released', 'Approved, then what was granted was taken back', 'migration', 'migration'),
  ('cancelled', 'Cancelled by the tenant before a decision', 'migration', 'migration')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notify.tenant_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id UUID NOT NULL REFERENCES notify.tenant (id) ON DELETE CASCADE,
  request_type_code VARCHAR(30) NOT NULL REFERENCES notify.tenant_request_type_code (code),
  status_code VARCHAR(20) NOT NULL DEFAULT 'pending' REFERENCES notify.tenant_request_status_code (code),
  decided_by VARCHAR(200),
  decided_by_name VARCHAR(200),
  decided_at TIMESTAMPTZ,
  decision_reason VARCHAR(500),
  released_by VARCHAR(200),
  released_by_name VARCHAR(200),
  released_at TIMESTAMPTZ,
  cancelled_by VARCHAR(200),
  cancelled_by_name VARCHAR(200),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  created_by VARCHAR(200),
  created_by_name VARCHAR(200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  updated_by VARCHAR(200),
  -- Target of each type's detail table, whose composite key holds it to requests of its own type.
  CONSTRAINT uq_tenant_request_id_type UNIQUE (id, request_type_code)
);

-- One open request per tenant for each type.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_request_tenant_type_pending ON notify.tenant_request (tenant_id, request_type_code)
WHERE
  status_code = 'pending';

CREATE INDEX IF NOT EXISTS idx_tenant_request_status_created_at ON notify.tenant_request (status_code, created_at);
CREATE INDEX IF NOT EXISTS idx_tenant_request_tenant_type_created_at ON notify.tenant_request (tenant_id, request_type_code, created_at DESC);

COMMENT ON TABLE notify.tenant_request IS 'A tenant''s request for something a Notify admin must approve. Rows are kept after a decision as the record of it.';
COMMENT ON COLUMN notify.tenant_request.request_type_code IS 'What is being asked for. The type''s own table holds its details.';
COMMENT ON COLUMN notify.tenant_request.created_by IS 'Stable identifier of the tenant user who made the request (JWT preferred_username).';
COMMENT ON COLUMN notify.tenant_request.created_by_name IS 'Display name of the tenant user who made the request, at the time. NULL if the token carried none.';
COMMENT ON COLUMN notify.tenant_request.updated_by IS 'Stable identifier of whoever last changed the request''s status. tenant_request_history has every change.';
COMMENT ON COLUMN notify.tenant_request.decided_by IS 'Stable identifier of the admin who approved or rejected the request. NULL while pending.';
COMMENT ON COLUMN notify.tenant_request.decision_reason IS 'Why the request was rejected. Shown to the tenant.';
COMMENT ON COLUMN notify.tenant_request.cancelled_by IS 'Stable identifier of the tenant user who cancelled the request while it was pending. NULL unless cancelled.';
COMMENT ON COLUMN notify.tenant_request.released_by IS 'Stable identifier of whoever took back what approval granted: a Notify admin or the tenant''s operations admin, through the request or by changing what it granted directly. NULL unless released.';

CREATE TABLE IF NOT EXISTS notify.tenant_request_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_request_id UUID NOT NULL,
  status_code VARCHAR(20) NOT NULL,
  reason VARCHAR(500),
  created_by VARCHAR(200) NOT NULL,
  created_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE INDEX IF NOT EXISTS idx_tenant_request_history_request_created_at ON notify.tenant_request_history (tenant_request_id, created_at);

COMMENT ON TABLE notify.tenant_request_history IS 'Audit trail of a tenant request: one row for each status it enters, including pending when it is made, written in the same transaction as the change. Append-only. No foreign keys, matching tenant_sending_history: an audit trail must outlive what it describes.';
COMMENT ON COLUMN notify.tenant_request_history.status_code IS 'The status the request entered.';
COMMENT ON COLUMN notify.tenant_request_history.reason IS 'The reason given, required when rejecting. NULL otherwise.';
COMMENT ON COLUMN notify.tenant_request_history.created_by IS 'Stable identifier of who made the change (JWT preferred_username): the tenant user for pending and cancelled, a Notify admin for approved and rejected, either for released.';
COMMENT ON COLUMN notify.tenant_request_history.created_by_name IS 'Display name of that user at the time. NULL if the token carried none.';

COMMIT;
