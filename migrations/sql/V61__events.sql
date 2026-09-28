-- V61: Notification events.
--
-- An event is a named, reusable notification definition owned by a tenant. It is configured
-- through three UI tabs, which map onto these tables:
--
--   Event settings tab -> notify.notification_event
--                         name + description.
--   Email settings tab -> notify.event_channel_setting (channel_code = 'EMAIL')
--                         active flag, sender email address, template, header.
--   SMS settings tab   -> notify.event_channel_setting (channel_code = 'SMS')
--                         active flag, from number (from the V60 pool), template.
--   Both tabs          -> notify.event_channel_recipient
--                         one row per recipient, its list taken from
--                         notify.event_recipient_kind_code and constrained to the lists the
--                         channel supports by notify.channel_recipient_kind.
--
-- The table is notification_event rather than event: the name sits beside the unrelated
-- /notifyevent API and notify-event gateway routes, and matches what the UI calls these.
--
-- Recipients are rows rather than a comma-separated column, so the database can hold the rules
-- the application would otherwise hold alone: each address is checked against its channel's
-- format, duplicates are rejected by a unique index, and "which events send to this address?"
-- is a query rather than a string scan. Manual entry only for now; imported/dynamic recipient
-- sources are a later change.
--
-- Deliberately NOT in this migration (pending design):
--   - footer overrides on the email tab
--   - attachment service linkage
--   - linking a dispatched notification_request back to the event that produced it
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Event (Event settings tab)
-- ---------------------------------------------------------------------------
CREATE TABLE
  notify.notification_event (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    tenant_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    updated_by VARCHAR(200),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT pk_notification_event PRIMARY KEY (id),
    CONSTRAINT fk_notification_event_tenant FOREIGN KEY (tenant_id) REFERENCES notify.tenant (id) ON DELETE CASCADE,
    CONSTRAINT chk_notification_event_name CHECK (length(btrim(name)) > 0)
  );

-- Event names are unique per tenant, case insensitively. Partial so a deleted event does not
-- reserve its name forever.
CREATE UNIQUE INDEX uq_notification_event_tenant_name ON notify.notification_event (tenant_id, lower(btrim(name)))
WHERE
  is_deleted = FALSE;

CREATE INDEX idx_notification_event_tenant ON notify.notification_event (tenant_id)
WHERE
  is_deleted = FALSE;

CREATE TRIGGER trg_notification_event_updated_at BEFORE
UPDATE ON notify.notification_event FOR EACH ROW
EXECUTE FUNCTION notify.set_updated_at ();

COMMENT ON TABLE notify.notification_event IS 'A tenant-owned, named notification definition. Per-channel configuration lives in notify.event_channel_setting, and its recipients in notify.event_channel_recipient.';

COMMENT ON COLUMN notify.notification_event.id IS 'Unique identifier for the event.';

COMMENT ON COLUMN notify.notification_event.tenant_id IS 'Tenant that owns this event. Cascade deleted with the tenant.';

COMMENT ON COLUMN notify.notification_event.name IS 'Event name entered on the Event settings tab. Unique per tenant, case insensitive, among non-deleted events.';

COMMENT ON COLUMN notify.notification_event.description IS 'Free-text description of what the event is for. Optional.';

COMMENT ON COLUMN notify.notification_event.created_at IS 'Timestamp with timezone when the event was created.';

COMMENT ON COLUMN notify.notification_event.created_by IS 'Identifier of the user or process that created this event.';

COMMENT ON COLUMN notify.notification_event.updated_at IS 'Timestamp with timezone when the event was last updated. Maintained by trg_notification_event_updated_at.';

COMMENT ON COLUMN notify.notification_event.updated_by IS 'Identifier of the user or process that last updated this event.';

COMMENT ON COLUMN notify.notification_event.is_deleted IS 'Soft delete flag. Deleted events are hidden from the UI and are never dispatched.';

-- ---------------------------------------------------------------------------
-- 2. Per-channel settings (Email settings tab / SMS settings tab)
-- ---------------------------------------------------------------------------
-- One row per event per channel. Channel-specific columns are nullable and constrained so an
-- EMAIL row can only carry a sender email and an SMS row can only carry a from number.
CREATE TABLE
  notify.event_channel_setting (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    event_id UUID NOT NULL,
    channel_code VARCHAR(20) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    template_id UUID,
    sender_email VARCHAR(320),
    from_phone_number_id UUID,
    -- Email header. When use_custom_header is FALSE the two value columns are NULL and
    -- they inherit from tenant_settings.
    use_custom_header BOOLEAN NOT NULL DEFAULT FALSE,
    header_logo_id UUID,
    header_title VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    updated_by VARCHAR(200),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT pk_event_channel_setting PRIMARY KEY (id),
    CONSTRAINT fk_event_channel_setting_event FOREIGN KEY (event_id) REFERENCES notify.notification_event (id) ON DELETE CASCADE,
    CONSTRAINT fk_event_channel_setting_channel FOREIGN KEY (channel_code) REFERENCES notify.notification_channel_code (channel_code),
    CONSTRAINT fk_event_channel_setting_template FOREIGN KEY (template_id) REFERENCES notify.template (id),
    CONSTRAINT fk_event_channel_setting_number FOREIGN KEY (from_phone_number_id) REFERENCES notify.provisioned_phone_number (id),
    CONSTRAINT fk_event_channel_setting_header_logo FOREIGN KEY (header_logo_id) REFERENCES notify.email_logo (id),
    CONSTRAINT uq_event_channel_setting UNIQUE (event_id, channel_code),
    -- Target for event_channel_recipient's composite foreign key, which is how a recipient row
    -- is held to its parent's channel. Redundant with the primary key on its own.
    CONSTRAINT uq_event_channel_setting_id_channel UNIQUE (id, channel_code),
    -- Which codes are valid is fk_event_channel_setting_channel's job. The shape constraint
    -- below is what confines a row to EMAIL or SMS, because neither branch matches any other
    -- channel - so a channel gains event support by getting a branch here, not by editing a
    -- list of codes.
    -- Channel-appropriate columns only.
    CONSTRAINT chk_event_channel_setting_shape CHECK (
      (
        channel_code = 'EMAIL'
        AND from_phone_number_id IS NULL
      )
      OR (
        channel_code = 'SMS'
        AND sender_email IS NULL
        AND use_custom_header = FALSE
        AND header_logo_id IS NULL
        AND header_title IS NULL
      )
    ),
    -- The tenant default carries no header of its own, so the two value columns only ever hold
    -- something for a custom header.
    CONSTRAINT chk_event_channel_setting_custom_header CHECK (
      use_custom_header = TRUE
      OR (
        header_logo_id IS NULL
        AND header_title IS NULL
      )
    ),
    CONSTRAINT chk_event_channel_setting_header_title CHECK (
      header_title IS NULL
      OR btrim(header_title) <> ''
    ),
    -- Pragmatic syntax check only; the sending domain is enforced by the application, and
    -- deliverability/ownership of the address by the mail provider.
    CONSTRAINT chk_event_channel_setting_sender_email CHECK (
      sender_email IS NULL
      OR sender_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    ),
    -- A channel cannot be switched on until its own columns are filled in. The UI's active
    -- toggle is local until "Save" is used, so the only path that sets active = TRUE is the one
    -- that writes a complete set of settings alongside it. Turning a channel off is unaffected,
    -- since active = FALSE always satisfies this.
    --
    -- "At least one recipient" is deliberately absent: recipients are rows in
    -- event_channel_recipient, and a CHECK cannot see another table. EventsService enforces it
    -- on the same save that sets active.
    CONSTRAINT chk_event_channel_setting_active_complete CHECK (
      active = FALSE
      OR (
        template_id IS NOT NULL
        AND (
          (
            channel_code = 'EMAIL'
            AND sender_email IS NOT NULL
          )
          OR (
            channel_code = 'SMS'
            AND from_phone_number_id IS NOT NULL
          )
        )
      )
    )
  );

-- Deliberately NOT unique: a tenant holds a single number (V60) and every one of its SMS events
-- sends from it. This index backs the release guard's "is anything still using this number?"
-- lookup and the admin view of which events a number serves.
CREATE INDEX idx_event_channel_setting_number ON notify.event_channel_setting (from_phone_number_id)
WHERE
  is_deleted = FALSE
  AND from_phone_number_id IS NOT NULL;

CREATE INDEX idx_event_channel_setting_event ON notify.event_channel_setting (event_id)
WHERE
  is_deleted = FALSE;

-- "Which events use this template?" - the lookup a guard on template deactivation/deletion
-- needs. No such guard exists yet; templates.service soft-deletes unconditionally.
CREATE INDEX idx_event_channel_setting_template ON notify.event_channel_setting (template_id)
WHERE
  is_deleted = FALSE
  AND template_id IS NOT NULL;

-- "Which events use this logo?" - same, for email logo deletion/unapproval.
CREATE INDEX idx_event_channel_setting_header_logo ON notify.event_channel_setting (header_logo_id)
WHERE
  is_deleted = FALSE
  AND header_logo_id IS NOT NULL;

CREATE TRIGGER trg_event_channel_setting_updated_at BEFORE
UPDATE ON notify.event_channel_setting FOR EACH ROW
EXECUTE FUNCTION notify.set_updated_at ();

COMMENT ON TABLE notify.event_channel_setting IS 'Per-channel configuration for an event, one row per (event, channel). Backs the Email settings and SMS settings tabs. Channel-specific columns are constrained so EMAIL rows carry sender_email and header values and SMS rows carry from_phone_number_id. Recipients live in notify.event_channel_recipient.';

COMMENT ON COLUMN notify.event_channel_setting.id IS 'Unique identifier for the channel setting row.';

COMMENT ON COLUMN notify.event_channel_setting.event_id IS 'Event these settings belong to. Cascade deleted with the event.';

COMMENT ON COLUMN notify.event_channel_setting.channel_code IS 'Channel these settings configure (EMAIL or SMS).';

COMMENT ON COLUMN notify.event_channel_setting.active IS 'Active indicator for the channel. When false the event does not send on this channel. Cannot be set true until the template and the channel sender (sender_email for EMAIL, from_phone_number_id for SMS) are populated; the matching "at least one recipient" rule is enforced by the application, since recipients are rows in another table.';

COMMENT ON COLUMN notify.event_channel_setting.template_id IS 'Template used to render this channel. Must be an active template belonging to the same tenant as the event and matching channel_code; enforced by the application. Templates are authored separately by CSTAR template admins - the event only selects an existing one.';

COMMENT ON COLUMN notify.event_channel_setting.sender_email IS 'From address for EMAIL sends. NULL on SMS rows. Format checked here; the permitted sending domain is enforced by the application.';

COMMENT ON COLUMN notify.event_channel_setting.from_phone_number_id IS 'Provisioned number used as the from number for SMS sends. NULL on EMAIL rows. Set by claiming a number from the available pool the first time the tenant configures SMS; thereafter it is the tenant''s single allocated number (V60), shared by all of that tenant''s SMS events, so this is not unique.';

COMMENT ON COLUMN notify.event_channel_setting.use_custom_header IS 'When false the email inherits the tenant''s default header from notify.tenant_settings and the header columns here stay NULL; when true the event owns its header outright, inherits nothing, and uses header_logo_id and header_title as given. EMAIL only; always false on SMS rows. Stored explicitly so a custom header with no logo and no title stays distinct from the tenant default.';

COMMENT ON COLUMN notify.event_channel_setting.header_logo_id IS 'Approved email logo shown in the custom email header. NULL means the custom header has no logo, never "inherit the tenant logo". Only set when use_custom_header = TRUE.';

COMMENT ON COLUMN notify.event_channel_setting.header_title IS 'Title text shown beside the logo in the custom email header, defaulted in the UI to the tenant name. NULL means the custom header has no title, never "inherit the tenant title". Only set when use_custom_header = TRUE, so a tenant-level default title added to notify.tenant_settings later applies to exactly the rows with use_custom_header = FALSE and needs no change here.';

COMMENT ON COLUMN notify.event_channel_setting.created_at IS 'Timestamp with timezone when the channel setting was created.';

COMMENT ON COLUMN notify.event_channel_setting.created_by IS 'Identifier of the user or process that created this record.';

COMMENT ON COLUMN notify.event_channel_setting.updated_at IS 'Timestamp with timezone when the channel setting was last updated. Maintained by trg_event_channel_setting_updated_at.';

COMMENT ON COLUMN notify.event_channel_setting.updated_by IS 'Identifier of the user or process that last updated this record.';

COMMENT ON COLUMN notify.event_channel_setting.is_deleted IS 'Soft delete flag. Deleted rows release their from number back to the picker.';

-- ---------------------------------------------------------------------------
-- 3. Recipient kinds and address formats (code tables)
-- ---------------------------------------------------------------------------
-- What a recipient address has to look like, per channel, as data on the channel itself. A
-- CHECK constraint cannot read another table, so the rule is applied by the trigger on
-- event_channel_recipient below - which keeps the channel's own definition in one place
-- instead of repeating 'EMAIL'/'SMS' in constraints.
--
-- The patterns also reject anything the application would have normalized away: the email
-- pattern excludes upper case, so a row that skipped normalizeRecipient() cannot be stored and
-- then sit beside its own lower-case twin, which the unique index would not catch.
ALTER TABLE notify.notification_channel_code
ADD COLUMN recipient_pattern VARCHAR(500);

COMMENT ON COLUMN notify.notification_channel_code.recipient_pattern IS 'POSIX regular expression a recipient address must match for this channel, in the normalized form the application stores (lower-cased email, E.164 phone number). NULL means no format is defined, and addresses are not checked. Applied by notify.check_event_channel_recipient_address().';

UPDATE notify.notification_channel_code
SET
  recipient_pattern = '^[^@[:space:][:upper:]]+@[^@[:space:][:upper:]]+\.[^@[:space:][:upper:]]+$'
WHERE
  channel_code = 'EMAIL';

UPDATE notify.notification_channel_code
SET
  recipient_pattern = '^\+[1-9][0-9]{1,14}$'
WHERE
  channel_code = 'SMS';

CREATE TABLE
  notify.event_recipient_kind_code (
    kind_code VARCHAR(3) PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_by VARCHAR(200)
  );

COMMENT ON TABLE notify.event_recipient_kind_code IS 'Code table for the recipient lists an event channel can address (to, cc, bcc).';

COMMENT ON COLUMN notify.event_recipient_kind_code.kind_code IS 'Recipient list code (TO, CC, BCC). Primary key.';

COMMENT ON COLUMN notify.event_recipient_kind_code.description IS 'Human-readable description of the recipient list.';

COMMENT ON COLUMN notify.event_recipient_kind_code.created_at IS 'Timestamp when the kind code was created.';

COMMENT ON COLUMN notify.event_recipient_kind_code.created_by IS 'User or process that created this record.';

COMMENT ON COLUMN notify.event_recipient_kind_code.updated_at IS 'Timestamp when the kind code was last updated.';

COMMENT ON COLUMN notify.event_recipient_kind_code.updated_by IS 'User or process that last updated this record.';

INSERT INTO
  notify.event_recipient_kind_code (kind_code, description, created_by, updated_by)
VALUES
  ('TO', 'Primary recipient', 'system', 'system'),
  ('CC', 'Carbon copy recipient', 'system', 'system'),
  (
    'BCC',
    'Blind carbon copy recipient',
    'system',
    'system'
  ) ON CONFLICT (kind_code) DO NOTHING;

-- Which lists each channel supports: email addresses all three, SMS only has a "to". Held as
-- rows rather than as a constraint so a channel that gains cc/bcc later is an INSERT, and so
-- the pairing is queryable by anything that needs to know what a channel accepts.
CREATE TABLE
  notify.channel_recipient_kind (
    channel_code VARCHAR(20) NOT NULL,
    kind_code VARCHAR(3) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
    updated_by VARCHAR(200),
    CONSTRAINT pk_channel_recipient_kind PRIMARY KEY (channel_code, kind_code),
    CONSTRAINT fk_channel_recipient_kind_channel FOREIGN KEY (channel_code) REFERENCES notify.notification_channel_code (channel_code),
    CONSTRAINT fk_channel_recipient_kind_kind FOREIGN KEY (kind_code) REFERENCES notify.event_recipient_kind_code (kind_code)
  );

COMMENT ON TABLE notify.channel_recipient_kind IS 'Which recipient lists each notification channel supports. EMAIL carries to/cc/bcc; SMS carries to only. event_channel_recipient references this pair, so an unsupported combination cannot be stored.';

COMMENT ON COLUMN notify.channel_recipient_kind.channel_code IS 'Channel the pairing applies to.';

COMMENT ON COLUMN notify.channel_recipient_kind.kind_code IS 'Recipient list the channel supports.';

COMMENT ON COLUMN notify.channel_recipient_kind.created_at IS 'Timestamp when the pairing was created.';

COMMENT ON COLUMN notify.channel_recipient_kind.created_by IS 'User or process that created this record.';

COMMENT ON COLUMN notify.channel_recipient_kind.updated_at IS 'Timestamp when the pairing was last updated.';

COMMENT ON COLUMN notify.channel_recipient_kind.updated_by IS 'User or process that last updated this record.';

INSERT INTO
  notify.channel_recipient_kind (channel_code, kind_code, created_by, updated_by)
VALUES
  ('EMAIL', 'TO', 'system', 'system'),
  ('EMAIL', 'CC', 'system', 'system'),
  ('EMAIL', 'BCC', 'system', 'system'),
  ('SMS', 'TO', 'system', 'system') ON CONFLICT (channel_code, kind_code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Recipients (both tabs)
-- ---------------------------------------------------------------------------
-- One row per manually entered recipient. Addresses are stored normalized - lowercased/trimmed
-- email, E.164 phone number - which is what makes the unique index below meaningful, and is
-- enforced against the channel's own recipient_pattern by the trigger under the table.
--
-- channel_code is carried here rather than looked up through the parent so the (channel, kind)
-- pairing can be a foreign key; the composite key to the parent setting keeps it identical to
-- the parent's, so the two cannot drift.
--
-- Rows are soft deleted, like recipient_safelist: removing a recipient is an UPDATE, so the
-- history table keeps who was removed and when rather than losing the row.
CREATE TABLE
  notify.event_channel_recipient (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    channel_setting_id UUID NOT NULL,
    channel_code VARCHAR(20) NOT NULL,
    kind VARCHAR(3) NOT NULL,
    address VARCHAR(320) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    updated_by VARCHAR(200),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT pk_event_channel_recipient PRIMARY KEY (id),
    CONSTRAINT fk_event_channel_recipient_setting FOREIGN KEY (channel_setting_id, channel_code) REFERENCES notify.event_channel_setting (id, channel_code) ON DELETE CASCADE,
    -- Valid kind, and one this channel actually supports: cc on an SMS row has no pairing in
    -- channel_recipient_kind and is rejected here rather than by a hand-maintained CHECK.
    CONSTRAINT fk_event_channel_recipient_kind FOREIGN KEY (channel_code, kind) REFERENCES notify.channel_recipient_kind (channel_code, kind_code),
    -- Cheap row-local rule; the channel's own format comes from
    -- notification_channel_code.recipient_pattern, applied by the trigger below.
    CONSTRAINT chk_event_channel_recipient_address CHECK (
      address = btrim(address)
      AND length(address) > 0
    )
  );

-- Applies the address format the channel defines. A CHECK cannot read another table, so this is
-- a trigger; it is skipped on the updates that only flip is_deleted, which is what removing and
-- restoring a recipient does.
CREATE OR REPLACE FUNCTION notify.check_event_channel_recipient_address () RETURNS TRIGGER AS $$
DECLARE
  v_pattern TEXT;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.address IS NOT DISTINCT FROM OLD.address
     AND NEW.channel_code IS NOT DISTINCT FROM OLD.channel_code THEN
    RETURN NEW;
  END IF;

  SELECT recipient_pattern
    INTO v_pattern
    FROM notify.notification_channel_code
   WHERE channel_code = NEW.channel_code;

  IF v_pattern IS NOT NULL AND NEW.address !~ v_pattern THEN
    RAISE EXCEPTION
      'Recipient "%" is not a valid % address, or is not normalized',
      NEW.address, NEW.channel_code
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION notify.check_event_channel_recipient_address () IS 'Rejects an event recipient whose address does not match notification_channel_code.recipient_pattern for its channel. Keeps the per-channel format with the channel definition rather than in a constraint that names channels.';

CREATE TRIGGER trg_event_channel_recipient_address BEFORE INSERT
OR
UPDATE ON notify.event_channel_recipient FOR EACH ROW
EXECUTE FUNCTION notify.check_event_channel_recipient_address ();

-- One address per kind per channel: the de-duplication the application used to do on its own.
-- Partial so a removed recipient can be added back later.
CREATE UNIQUE INDEX uq_event_channel_recipient_active ON notify.event_channel_recipient (channel_setting_id, kind, address)
WHERE
  is_deleted = FALSE;

-- "This channel's recipients", the read behind every event page load.
CREATE INDEX idx_event_channel_recipient_setting ON notify.event_channel_recipient (channel_setting_id)
WHERE
  is_deleted = FALSE;

-- "Which events send to this address?" - for support requests and unsubscribe handling.
CREATE INDEX idx_event_channel_recipient_address ON notify.event_channel_recipient (address)
WHERE
  is_deleted = FALSE;

CREATE TRIGGER trg_event_channel_recipient_updated_at BEFORE
UPDATE ON notify.event_channel_recipient FOR EACH ROW
EXECUTE FUNCTION notify.set_updated_at ();

COMMENT ON TABLE notify.event_channel_recipient IS 'Manually entered recipients of an event channel, one row per address. Which lists a channel may use comes from notify.channel_recipient_kind. Addresses are stored normalized, and are unique per (channel setting, kind) among non-deleted rows.';

COMMENT ON COLUMN notify.event_channel_recipient.id IS 'Unique identifier for the recipient row.';

COMMENT ON COLUMN notify.event_channel_recipient.channel_setting_id IS 'Channel setting this recipient belongs to. Cascade deleted with it.';

COMMENT ON COLUMN notify.event_channel_recipient.channel_code IS 'Channel of the parent setting, held identical to it by the composite foreign key to event_channel_setting. Stored here so (channel_code, kind) can reference notify.channel_recipient_kind, which is what rejects a list the channel does not support.';

COMMENT ON COLUMN notify.event_channel_recipient.kind IS 'Which recipient list the address belongs to, from notify.event_recipient_kind_code. Paired with channel_code against notify.channel_recipient_kind, so SMS rows can only be TO.';

COMMENT ON COLUMN notify.event_channel_recipient.address IS 'The recipient, normalized by the application before it is stored: lowercased/trimmed email address for EMAIL, E.164 phone number for SMS. Checked against notification_channel_code.recipient_pattern for the channel.';

COMMENT ON COLUMN notify.event_channel_recipient.created_at IS 'Timestamp with timezone when the recipient was added.';

COMMENT ON COLUMN notify.event_channel_recipient.created_by IS 'Identifier of the user or process that added this recipient.';

COMMENT ON COLUMN notify.event_channel_recipient.updated_at IS 'Timestamp with timezone when the recipient row was last updated. Maintained by trg_event_channel_recipient_updated_at.';

COMMENT ON COLUMN notify.event_channel_recipient.updated_by IS 'Identifier of the user or process that last updated this recipient.';

COMMENT ON COLUMN notify.event_channel_recipient.is_deleted IS 'Soft delete flag. Removing a recipient sets this rather than deleting the row, so the history table keeps the removal.';

-- ---------------------------------------------------------------------------
-- 5. Audit history
-- ---------------------------------------------------------------------------
-- These rows decide who receives a notification and what it is sent from, so every change is
-- recorded. notify.audit_history_preserving_actor() rather than notify.audit_history(): the
-- API sets created_by/updated_by to the caller's IDIR GUID, and the plain function overwrites
-- both with the database role (see V53).
CREATE TABLE
  notify.notification_event_history (
    h_id UUID DEFAULT gen_random_uuid () NOT NULL PRIMARY KEY,
    target_row_id UUID NOT NULL,
    operation_type CHAR(1) NOT NULL,
    operation_user VARCHAR(200) DEFAULT CURRENT_USER NOT NULL,
    operation_executed_at TIMESTAMPTZ DEFAULT now () NOT NULL,
    data_after_operation JSONB NOT NULL
  );

CREATE INDEX idx_notification_event_history_target_row ON notify.notification_event_history (target_row_id);

CREATE INDEX idx_notification_event_history_timestamp ON notify.notification_event_history (operation_executed_at DESC);

COMMENT ON TABLE notify.notification_event_history IS 'Immutable audit log of changes to notification_event. Each row is a full snapshot after INSERT/UPDATE, attributed to the row''s own audit user.';

CREATE TRIGGER notification_event_audit
AFTER INSERT
OR
UPDATE ON notify.notification_event FOR EACH ROW
EXECUTE FUNCTION notify.audit_history_preserving_actor ('notification_event_history', 'id');

CREATE TABLE
  notify.event_channel_setting_history (
    h_id UUID DEFAULT gen_random_uuid () NOT NULL PRIMARY KEY,
    target_row_id UUID NOT NULL,
    operation_type CHAR(1) NOT NULL,
    operation_user VARCHAR(200) DEFAULT CURRENT_USER NOT NULL,
    operation_executed_at TIMESTAMPTZ DEFAULT now () NOT NULL,
    data_after_operation JSONB NOT NULL
  );

CREATE INDEX idx_event_channel_setting_history_target_row ON notify.event_channel_setting_history (target_row_id);

CREATE INDEX idx_event_channel_setting_history_timestamp ON notify.event_channel_setting_history (operation_executed_at DESC);

COMMENT ON TABLE notify.event_channel_setting_history IS 'Immutable audit log of changes to event_channel_setting: activation, sender, template and header changes. Each row is a full snapshot after INSERT/UPDATE.';

CREATE TRIGGER event_channel_setting_audit
AFTER INSERT
OR
UPDATE ON notify.event_channel_setting FOR EACH ROW
EXECUTE FUNCTION notify.audit_history_preserving_actor ('event_channel_setting_history', 'id');

CREATE TABLE
  notify.event_channel_recipient_history (
    h_id UUID DEFAULT gen_random_uuid () NOT NULL PRIMARY KEY,
    target_row_id UUID NOT NULL,
    operation_type CHAR(1) NOT NULL,
    operation_user VARCHAR(200) DEFAULT CURRENT_USER NOT NULL,
    operation_executed_at TIMESTAMPTZ DEFAULT now () NOT NULL,
    data_after_operation JSONB NOT NULL
  );

CREATE INDEX idx_event_channel_recipient_history_target_row ON notify.event_channel_recipient_history (target_row_id);

CREATE INDEX idx_event_channel_recipient_history_timestamp ON notify.event_channel_recipient_history (operation_executed_at DESC);

COMMENT ON TABLE notify.event_channel_recipient_history IS 'Immutable audit log of changes to event_channel_recipient - who was added to or removed from an event, and by whom. Removal is a soft delete, so it appears here as an UPDATE.';

CREATE TRIGGER event_channel_recipient_audit
AFTER INSERT
OR
UPDATE ON notify.event_channel_recipient FOR EACH ROW
EXECUTE FUNCTION notify.audit_history_preserving_actor ('event_channel_recipient_history', 'id');

-- ---------------------------------------------------------------------------
-- 6. Guard: releasing a number back to the pool
-- ---------------------------------------------------------------------------
-- An sso.notify_admin can release a number back to the pool (tenant_id / allocated_at to NULL)
-- or retire it (is_deleted). Because a tenant holds one number that all of its SMS events share,
-- release is only safe when the tenant has *no event with SMS enabled* - otherwise a live event
-- would keep sending from a number that has been handed to another tenant.
--
-- The role check itself (sso.notify_admin) is the application's job; what the database enforces
-- is the precondition, so no code path can release a number out from under a sending event.
-- A plain FK cannot express this - the reference is not being deleted, only re-homed - so the
-- check lives in a trigger.
--
-- Events whose SMS tab is merely disabled do not block the release. Their stale pointer is
-- cleared as part of the same statement, so disabling SMS everywhere is all an admin has to ask
-- the tenant to do before reclaiming the number.
CREATE OR REPLACE FUNCTION notify.check_phone_number_release () RETURNS TRIGGER AS $$
DECLARE
  v_event_name TEXT;
BEGIN
  -- Only guard transitions that take the number away from its current holder: a change of
  -- tenant (including release to NULL) or a retirement.
  IF NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NOT (NEW.is_deleted AND NOT OLD.is_deleted) THEN
    RETURN NEW;
  END IF;

  SELECT e.name
    INTO v_event_name
    FROM notify.event_channel_setting ecs
    JOIN notify.notification_event e ON e.id = ecs.event_id
   WHERE ecs.from_phone_number_id = OLD.id
     AND ecs.is_deleted = FALSE
     AND ecs.active = TRUE
   LIMIT 1;

  IF v_event_name IS NOT NULL THEN
    RAISE EXCEPTION
      'Phone number % cannot be released or retired: event "%" still has SMS enabled. Disable SMS on that event first.',
      OLD.phone_number, v_event_name
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Everything still pointing at the number is a disabled SMS tab. Detach it rather than leave a
  -- pointer to a number that may be re-allocated to a different tenant. Safe against
  -- chk_event_channel_setting_active_complete precisely because these rows are inactive.
  UPDATE notify.event_channel_setting
     SET from_phone_number_id = NULL
   WHERE from_phone_number_id = OLD.id
     AND is_deleted = FALSE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION notify.check_phone_number_release () IS 'Blocks releasing, re-allocating or retiring a provisioned phone number while any non-deleted event_channel_setting referencing it still has active = TRUE. When every reference is inactive, clears those references so a released number leaves no cross-tenant pointer behind.';

CREATE TRIGGER trg_provisioned_phone_number_release BEFORE
UPDATE ON notify.provisioned_phone_number FOR EACH ROW
EXECUTE FUNCTION notify.check_phone_number_release ();

COMMIT;
