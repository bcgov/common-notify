-- ============================================================================
-- SMS numbers
--
-- The numbers Notify sends SMS from, which tenants they are assigned to, and
-- tenants' requests for one.
--
-- A number belongs to one provider: moving it to another means porting it. A
-- tenant therefore holds at most one number per provider, and a send uses the
-- tenant's number for whichever provider is active, so switching providers needs
-- no data change. A number can serve several tenants (a shared short code). A
-- tenant with no number for the active provider sends from that provider's
-- default number, flagged in sms_number; with none flagged, from the
-- DEFAULT_SMS_FROM_NUMBER environment variable.
--
-- Requests do not gate sending; the sms_notifications feature flag still does.
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- Code tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notify.sms_provider_code (
  code VARCHAR(20) PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  created_by VARCHAR(200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  updated_by VARCHAR(200)
);

COMMENT ON TABLE notify.sms_provider_code IS 'Code table of SMS providers. A code matches the name of the SMS transport that sends through it (DELIVERY_SMS_ADAPTER).';

INSERT INTO notify.sms_provider_code (code, description, created_by, updated_by)
VALUES
  ('aws', 'AWS End User Messaging', 'migration', 'migration'),
  ('acs', 'Azure Communication Services', 'migration', 'migration'),
  ('twilio', 'Twilio', 'migration', 'migration'),
  ('swift', 'Swift SMS Gateway', 'migration', 'migration')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS notify.sms_number_type_code (
  code VARCHAR(20) PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  created_by VARCHAR(200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  updated_by VARCHAR(200)
);

COMMENT ON TABLE notify.sms_number_type_code IS 'Code table of kinds of SMS number.';

INSERT INTO notify.sms_number_type_code (code, description, created_by, updated_by)
VALUES
  ('long_code', 'Long code', 'migration', 'migration'),
  ('toll_free', 'Toll-free', 'migration', 'migration'),
  ('short_code', 'Short code', 'migration', 'migration'),
  ('rcs', 'RCS', 'migration', 'migration')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS notify.sms_number_request_status_code (
  code VARCHAR(20) PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  created_by VARCHAR(200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  updated_by VARCHAR(200)
);

COMMENT ON TABLE notify.sms_number_request_status_code IS 'Code table of statuses of a tenant''s request for an SMS number.';

INSERT INTO notify.sms_number_request_status_code (code, description, created_by, updated_by)
VALUES
  ('pending', 'Waiting for a Notify admin to decide', 'migration', 'migration'),
  ('approved', 'Approved, and a number assigned to the tenant', 'migration', 'migration'),
  ('rejected', 'Rejected by a Notify admin', 'migration', 'migration'),
  ('released', 'Approved, then the number was released from the tenant', 'migration', 'migration'),
  ('cancelled', 'Cancelled by the tenant before a decision', 'migration', 'migration')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Numbers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notify.sms_number (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  phone_number VARCHAR(16) NOT NULL,
  provider_code VARCHAR(20) NOT NULL REFERENCES notify.sms_provider_code (code),
  number_type_code VARCHAR(20) NOT NULL REFERENCES notify.sms_number_type_code (code),
  provider_reference VARCHAR(200),
  description VARCHAR(500),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  created_by VARCHAR(200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  updated_by VARCHAR(200),
  -- E.164 (a long code or toll-free number) or a 5-6 digit Canadian short code.
  CONSTRAINT chk_sms_number_phone_number CHECK (
    phone_number ~ '^(\+[1-9][0-9]{6,14}|[0-9]{5,6})$'
  ),
  -- Target of tenant_sms_number's composite key, which holds an assignment's provider to its number's.
  CONSTRAINT uq_sms_number_id_provider UNIQUE (id, provider_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_number_provider_phone ON notify.sms_number (provider_code, phone_number)
WHERE
  NOT is_deleted;

-- One default number per provider.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_number_provider_default ON notify.sms_number (provider_code)
WHERE
  is_default
  AND NOT is_deleted;

COMMENT ON TABLE notify.sms_number IS 'The SMS numbers Notify owns, each with the provider it is hosted by. Maintained by Notify admins.';
COMMENT ON COLUMN notify.sms_number.phone_number IS 'E.164, or a 5-6 digit short code. Sent as the origination identity.';
COMMENT ON COLUMN notify.sms_number.provider_code IS 'The provider hosting the number. Only a send through that provider uses it.';
COMMENT ON COLUMN notify.sms_number.provider_reference IS 'The provider''s own id for the number (an AWS phone number id, say), for finding it in the provider''s console. Not used to send.';
COMMENT ON COLUMN notify.sms_number.description IS 'Admin notes on the number.';
COMMENT ON COLUMN notify.sms_number.is_default IS 'The number a tenant with none of its own sends from, when SMS goes through this number''s provider. At most one per provider. Each environment sets its own.';
COMMENT ON COLUMN notify.sms_number.is_deleted IS 'Soft delete. A number assigned to a tenant, or the default, cannot be deleted.';

-- ---------------------------------------------------------------------------
-- Assignments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notify.tenant_sms_number (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id UUID NOT NULL REFERENCES notify.tenant (id) ON DELETE CASCADE,
  sms_number_id UUID NOT NULL,
  provider_code VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  created_by VARCHAR(200),
  created_by_name VARCHAR(200),
  CONSTRAINT fk_tenant_sms_number_number FOREIGN KEY (sms_number_id, provider_code) REFERENCES notify.sms_number (id, provider_code) ON DELETE RESTRICT,
  CONSTRAINT uq_tenant_sms_number_tenant_provider UNIQUE (tenant_id, provider_code)
);

CREATE INDEX IF NOT EXISTS idx_tenant_sms_number_number ON notify.tenant_sms_number (sms_number_id);

COMMENT ON TABLE notify.tenant_sms_number IS 'Which number each tenant sends from, per provider. At most one per tenant per provider; a number may serve several tenants.';
COMMENT ON COLUMN notify.tenant_sms_number.provider_code IS 'The number''s provider, copied here so the unique key can allow one number per tenant per provider. The composite foreign key keeps it equal to the number''s.';
COMMENT ON COLUMN notify.tenant_sms_number.created_by IS 'Stable identifier of the admin who assigned the number (JWT preferred_username).';
COMMENT ON COLUMN notify.tenant_sms_number.created_by_name IS 'Display name of that admin at the time.';

-- ---------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notify.sms_number_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  tenant_id UUID NOT NULL REFERENCES notify.tenant (id) ON DELETE CASCADE,
  status_code VARCHAR(20) NOT NULL DEFAULT 'pending' REFERENCES notify.sms_number_request_status_code (code),
  decided_by VARCHAR(200),
  decided_by_name VARCHAR(200),
  decided_at TIMESTAMPTZ,
  decision_reason VARCHAR(500),
  sms_number_id UUID REFERENCES notify.sms_number (id),
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
  updated_by VARCHAR(200)
);

-- One open request per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_number_request_tenant_pending ON notify.sms_number_request (tenant_id)
WHERE
  status_code = 'pending';

CREATE INDEX IF NOT EXISTS idx_sms_number_request_status_created_at ON notify.sms_number_request (status_code, created_at);
CREATE INDEX IF NOT EXISTS idx_sms_number_request_tenant_created_at ON notify.sms_number_request (tenant_id, created_at DESC);

COMMENT ON TABLE notify.sms_number_request IS 'A tenant''s request for an SMS number, decided by a Notify admin. Rows are kept after a decision as the record of it.';
COMMENT ON COLUMN notify.sms_number_request.created_by IS 'Stable identifier of the tenant user who made the request (JWT preferred_username).';
COMMENT ON COLUMN notify.sms_number_request.created_by_name IS 'Display name of the tenant user who made the request, at the time. NULL if the token carried none.';
COMMENT ON COLUMN notify.sms_number_request.updated_by IS 'Stable identifier of whoever last changed the request''s status. sms_number_request_history has every change.';
COMMENT ON COLUMN notify.sms_number_request.decided_by IS 'Stable identifier of the admin who approved or rejected the request. NULL while pending.';
COMMENT ON COLUMN notify.sms_number_request.decision_reason IS 'Why the request was rejected. Shown to the tenant.';
COMMENT ON COLUMN notify.sms_number_request.sms_number_id IS 'The number assigned on approval. NULL unless approved or released.';
COMMENT ON COLUMN notify.sms_number_request.cancelled_by IS 'Stable identifier of the tenant user who cancelled the request while it was pending. NULL unless cancelled.';
COMMENT ON COLUMN notify.sms_number_request.released_by IS 'Stable identifier of whoever released the number: a Notify admin or the tenant''s operations admin. Also set when an admin unassigns or replaces the number directly. NULL unless released.';

CREATE TABLE IF NOT EXISTS notify.sms_number_request_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  sms_number_request_id UUID NOT NULL,
  status_code VARCHAR(20) NOT NULL,
  reason VARCHAR(500),
  sms_number_id UUID,
  created_by VARCHAR(200) NOT NULL,
  created_by_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE INDEX IF NOT EXISTS idx_sms_number_request_history_request_created_at ON notify.sms_number_request_history (sms_number_request_id, created_at);

COMMENT ON TABLE notify.sms_number_request_history IS 'Audit trail of an SMS number request: one row for each status it enters, including pending when it is made, written in the same transaction as the change. Append-only. No foreign keys, matching tenant_sending_history: an audit trail must outlive what it describes.';
COMMENT ON COLUMN notify.sms_number_request_history.status_code IS 'The status the request entered.';
COMMENT ON COLUMN notify.sms_number_request_history.reason IS 'The reason given, required when rejecting. NULL otherwise.';
COMMENT ON COLUMN notify.sms_number_request_history.sms_number_id IS 'The number assigned or released, for approved and released. NULL otherwise.';
COMMENT ON COLUMN notify.sms_number_request_history.created_by IS 'Stable identifier of who made the change (JWT preferred_username): the tenant user for pending and cancelled, a Notify admin for approved and rejected, either for released.';
COMMENT ON COLUMN notify.sms_number_request_history.created_by_name IS 'Display name of that user at the time. NULL if the token carried none.';

COMMIT;
