-- V55: Events.
--
-- An event is a named, reusable notification definition owned by a tenant. It is configured
-- through three UI tabs, which map onto three tables:
--
--   Event settings tab -> notify.event
--                         name + description.
--   Email settings tab -> notify.event_channel_setting (channel_code = 'EMAIL')
--                         active flag, sender email address, template, recipients.
--   SMS settings tab   -> notify.event_channel_setting (channel_code = 'SMS')
--                         active flag, from number (from the V47 pool), template, recipients.
--
-- Recipients for both tabs live directly on notify.event_channel_setting as to/cc/bcc columns:
-- comma-separated, normalized values (lowercased/trimmed emails for EMAIL, E.164 phone numbers
-- for SMS's "to"). Manual entry only for now; imported/dynamic recipient sources are a later
-- change.
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
  notify.event (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    tenant_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    updated_by VARCHAR(200),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT pk_event PRIMARY KEY (id),
    CONSTRAINT fk_event_tenant FOREIGN KEY (tenant_id) REFERENCES notify.tenant (id) ON DELETE CASCADE,
    CONSTRAINT chk_event_name CHECK (length(btrim(name)) > 0)
  );

-- Event names are unique per tenant, case insensitively. Partial so a deleted event does not
-- reserve its name forever.
CREATE UNIQUE INDEX uq_event_tenant_name ON notify.event (tenant_id, lower(btrim(name)))
WHERE
  is_deleted = FALSE;

CREATE INDEX idx_event_tenant ON notify.event (tenant_id)
WHERE
  is_deleted = FALSE;

CREATE TRIGGER trg_event_updated_at BEFORE
UPDATE ON notify.event FOR EACH ROW
EXECUTE FUNCTION notify.set_updated_at ();

COMMENT ON TABLE notify.event IS 'A tenant-owned, named notification definition. Per-channel configuration, including recipients, lives in notify.event_channel_setting.';

COMMENT ON COLUMN notify.event.id IS 'Unique identifier for the event.';

COMMENT ON COLUMN notify.event.tenant_id IS 'Tenant that owns this event. Cascade deleted with the tenant.';

COMMENT ON COLUMN notify.event.name IS 'Event name entered on the Event settings tab. Unique per tenant, case insensitive, among non-deleted events.';

COMMENT ON COLUMN notify.event.description IS 'Free-text description of what the event is for. Optional.';

COMMENT ON COLUMN notify.event.created_at IS 'Timestamp with timezone when the event was created.';

COMMENT ON COLUMN notify.event.created_by IS 'Identifier of the user or process that created this event.';

COMMENT ON COLUMN notify.event.updated_at IS 'Timestamp with timezone when the event was last updated. Maintained by trg_event_updated_at.';

COMMENT ON COLUMN notify.event.updated_by IS 'Identifier of the user or process that last updated this event.';

COMMENT ON COLUMN notify.event.is_deleted IS 'Soft delete flag. Deleted events are hidden from the UI and are never dispatched.';

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
    "to" VARCHAR(10000),
    cc VARCHAR(10000),
    bcc VARCHAR(10000),
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
    CONSTRAINT fk_event_channel_setting_event FOREIGN KEY (event_id) REFERENCES notify.event (id) ON DELETE CASCADE,
    CONSTRAINT fk_event_channel_setting_channel FOREIGN KEY (channel_code) REFERENCES notify.notification_channel_code (channel_code),
    CONSTRAINT fk_event_channel_setting_template FOREIGN KEY (template_id) REFERENCES notify.template (id),
    CONSTRAINT fk_event_channel_setting_number FOREIGN KEY (from_phone_number_id) REFERENCES notify.provisioned_phone_number (id),
    CONSTRAINT fk_event_channel_setting_header_logo FOREIGN KEY (header_logo_id) REFERENCES notify.email_logo (id),
    CONSTRAINT uq_event_channel_setting UNIQUE (event_id, channel_code),
    CONSTRAINT chk_event_channel_setting_channel CHECK (channel_code IN ('EMAIL', 'SMS')),
    -- Channel-appropriate columns only.
    CONSTRAINT chk_event_channel_setting_shape CHECK (
      (
        channel_code = 'EMAIL'
        AND from_phone_number_id IS NULL
      )
      OR (
        channel_code = 'SMS'
        AND sender_email IS NULL
        AND cc IS NULL
        AND bcc IS NULL
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
    -- Pragmatic syntax check only; deliverability/ownership of the sender address is verified
    -- by the application against the mail provider.
    CONSTRAINT chk_event_channel_setting_sender_email CHECK (
      sender_email IS NULL
      OR sender_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    ),
    -- Comma-separated recipient lists cannot be blank once set; the application is
    -- responsible for normalizing entries before writing them here.
    CONSTRAINT chk_event_channel_setting_to CHECK (
      "to" IS NULL
      OR btrim("to") <> ''
    ),
    CONSTRAINT chk_event_channel_setting_cc CHECK (
      cc IS NULL
      OR btrim(cc) <> ''
    ),
    CONSTRAINT chk_event_channel_setting_bcc CHECK (
      bcc IS NULL
      OR btrim(bcc) <> ''
    ),
    -- A channel cannot be switched on until it is fully configured. The UI's active toggle is
    -- local until "Save" is used, so the only path that sets active = TRUE is the
    -- one that writes a complete set of settings alongside it. Turning a channel off is
    -- unaffected, since active = FALSE always satisfies this.
    CONSTRAINT chk_event_channel_setting_active_complete CHECK (
      active = FALSE
      OR (
        template_id IS NOT NULL
        AND "to" IS NOT NULL
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

-- Deliberately NOT unique: a tenant holds a single number (V47) and every one of its SMS events
-- sends from it. This index backs the release guard's "is anything still using this number?"
-- lookup and the admin view of which events a number serves.
CREATE INDEX idx_event_channel_setting_number ON notify.event_channel_setting (from_phone_number_id)
WHERE
  is_deleted = FALSE
  AND from_phone_number_id IS NOT NULL;

CREATE INDEX idx_event_channel_setting_event ON notify.event_channel_setting (event_id)
WHERE
  is_deleted = FALSE;

-- "Which events use this template?" - guards template deactivation/deletion.
CREATE INDEX idx_event_channel_setting_template ON notify.event_channel_setting (template_id)
WHERE
  is_deleted = FALSE
  AND template_id IS NOT NULL;

-- "Which events use this logo?" - guards email logo deletion/unapproval.
CREATE INDEX idx_event_channel_setting_header_logo ON notify.event_channel_setting (header_logo_id)
WHERE
  is_deleted = FALSE
  AND header_logo_id IS NOT NULL;

CREATE TRIGGER trg_event_channel_setting_updated_at BEFORE
UPDATE ON notify.event_channel_setting FOR EACH ROW
EXECUTE FUNCTION notify.set_updated_at ();

COMMENT ON TABLE notify.event_channel_setting IS 'Per-channel configuration for an event, one row per (event, channel). Backs the Email settings and SMS settings tabs. Channel-specific columns are constrained so EMAIL rows carry sender_email/cc/bcc and SMS rows carry from_phone_number_id.';

COMMENT ON COLUMN notify.event_channel_setting.id IS 'Unique identifier for the channel setting row.';

COMMENT ON COLUMN notify.event_channel_setting.event_id IS 'Event these settings belong to. Cascade deleted with the event.';

COMMENT ON COLUMN notify.event_channel_setting.channel_code IS 'Channel these settings configure (EMAIL or SMS).';

COMMENT ON COLUMN notify.event_channel_setting.active IS 'Active indicator for the channel. When false the event does not send on this channel. Cannot be set true until the template, recipients and the channel sender (sender_email for EMAIL, from_phone_number_id for SMS) are populated, so it is only ever turned on by the same save that writes those settings.';

COMMENT ON COLUMN notify.event_channel_setting.template_id IS 'Template used to render this channel. Must be an active template belonging to the same tenant as the event and matching channel_code; enforced by the application. Templates are authored separately by CSTAR template admins - the event only selects an existing one.';

COMMENT ON COLUMN notify.event_channel_setting.sender_email IS 'From address for EMAIL sends. NULL on SMS rows. Format checked here, ownership verified by the application against the mail provider.';

COMMENT ON COLUMN notify.event_channel_setting.from_phone_number_id IS 'Provisioned number used as the from number for SMS sends. NULL on EMAIL rows. Set by claiming a number from the available pool the first time the tenant configures SMS; thereafter it is the tenant''s single allocated number (V47), shared by all of that tenant''s SMS events, so this is not unique.';

COMMENT ON COLUMN notify.event_channel_setting."to" IS 'Comma-separated, normalized recipients for this channel: lowercased/trimmed email addresses for EMAIL rows, E.164 phone numbers for SMS rows. Required once active = TRUE.';

COMMENT ON COLUMN notify.event_channel_setting.cc IS 'Comma-separated, normalized, lowercased/trimmed CC email addresses. EMAIL only; NULL on SMS rows.';

COMMENT ON COLUMN notify.event_channel_setting.bcc IS 'Comma-separated, normalized, lowercased/trimmed BCC email addresses. EMAIL only; NULL on SMS rows.';

COMMENT ON COLUMN notify.event_channel_setting.use_custom_header IS 'When false the email inherits the tenant''s default header from notify.tenant_settings and the header columns here stay NULL; when true the event owns its header outright, inherits nothing, and uses header_logo_id and header_title as given. EMAIL only; always false on SMS rows. Stored explicitly so a custom header with no logo and no title stays distinct from the tenant default.';

COMMENT ON COLUMN notify.event_channel_setting.header_logo_id IS 'Approved email logo shown in the custom email header. NULL means the custom header has no logo, never "inherit the tenant logo". Only set when use_custom_header = TRUE.';

COMMENT ON COLUMN notify.event_channel_setting.header_title IS 'Title text shown beside the logo in the custom email header, defaulted in the UI to the tenant name. NULL means the custom header has no title, never "inherit the tenant title". Only set when use_custom_header = TRUE, so a tenant-level default title added to notify.tenant_settings later applies to exactly the rows with use_custom_header = FALSE and needs no change here.';

COMMENT ON COLUMN notify.event_channel_setting.created_at IS 'Timestamp with timezone when the channel setting was created.';

COMMENT ON COLUMN notify.event_channel_setting.created_by IS 'Identifier of the user or process that created this record.';

COMMENT ON COLUMN notify.event_channel_setting.updated_at IS 'Timestamp with timezone when the channel setting was last updated. Maintained by trg_event_channel_setting_updated_at.';

COMMENT ON COLUMN notify.event_channel_setting.updated_by IS 'Identifier of the user or process that last updated this record.';

COMMENT ON COLUMN notify.event_channel_setting.is_deleted IS 'Soft delete flag. Deleted rows release their from number back to the picker.';

-- ---------------------------------------------------------------------------
-- 3. Guard: releasing a number back to the pool
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
    JOIN notify.event e ON e.id = ecs.event_id
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
