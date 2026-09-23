-- V65: CSTAR group recipients on an event's email channel.
--
-- The Email settings tab can address a notification to CSTAR groups rather than (or as well as)
-- typed-in addresses. Only the group IDs are stored here; the members and their email addresses
-- live in CSTAR and are resolved at send time, so a group's membership changing is picked up
-- without touching the event.
--
-- A sibling table to event_channel_recipient rather than rows in it. A group ID is not an
-- address and does not survive that table's rules: check_event_channel_recipient_address()
-- matches every row against the channel's recipient_pattern, which for EMAIL requires an "@",
-- so storing a group there means weakening the one guarantee V61 bought - that a row which
-- skipped normalizeRecipient() cannot be stored. It would also put opaque IDs into
-- idx_event_channel_recipient_address, which exists to answer "which events send to this
-- address?" for support requests and unsubscribe handling. And a group is not a recipient in the
-- first place: it is a source of recipients, re-resolved on every send, where an address is a
-- fixed value.
--
-- The table is otherwise V61's recipient skeleton verbatim - composite foreign key to the parent
-- setting, kind paired against channel_recipient_kind, soft delete, partial unique index,
-- history trigger - so the two read and are maintained the same way.
--
-- event_channel_setting is deliberately untouched. chk_event_channel_setting_active_complete
-- never referenced the recipient lists: V61 leaves "at least one recipient" to EventsService
-- precisely because a CHECK cannot see another table. "A To group is a complete recipient choice
-- on its own" is therefore an application rule, and lives there.
BEGIN;

-- One row per group per recipient list. A field holds as many groups as the user picks; the
-- unique index below only rejects the same group listed twice in the same field.
--
-- channel_code is carried here rather than looked up through the parent for the same reason as
-- on event_channel_recipient: it lets (channel_code, kind) be a foreign key to
-- channel_recipient_kind, while the composite key to the parent keeps it identical to the
-- parent's, so the two cannot drift.
CREATE TABLE
  notify.event_channel_cstar_group (
    id UUID NOT NULL DEFAULT gen_random_uuid (),
    channel_setting_id UUID NOT NULL,
    channel_code VARCHAR(20) NOT NULL,
    kind VARCHAR(3) NOT NULL,
    cstar_group_id VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    created_by VARCHAR(200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
    updated_by VARCHAR(200),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT pk_event_channel_cstar_group PRIMARY KEY (id),
    CONSTRAINT fk_event_channel_cstar_group_setting FOREIGN KEY (channel_setting_id, channel_code) REFERENCES notify.event_channel_setting (id, channel_code) ON DELETE CASCADE,
    -- Valid kind, and one the channel actually supports - the same pairing that stops cc on an
    -- SMS row, rejected here rather than by a hand-maintained CHECK.
    CONSTRAINT fk_event_channel_cstar_group_kind FOREIGN KEY (channel_code, kind) REFERENCES notify.channel_recipient_kind (channel_code, kind_code),
    -- Groups are an email-channel concept for now. The pairing above would still admit
    -- ('SMS', 'TO'); SMS gaining group recipients later is a change to this one line.
    CONSTRAINT chk_event_channel_cstar_group_email CHECK (channel_code = 'EMAIL'),
    -- Mirrors CstarApiClient.SAFE_PATH_SEGMENT, so an ID the database accepts is one the client
    -- can safely place in a CSTAR URL path when it resolves the group's members.
    CONSTRAINT chk_event_channel_cstar_group_id CHECK (cstar_group_id ~ '^[A-Za-z0-9_-]{1,128}$')
  );

-- The same group at most once per list. A field may hold any number of different groups, and a
-- group may appear in more than one field - exactly as addresses behave, where the same address
-- is allowed in both "to" and cc. Partial, so a removed group can be added back later without
-- colliding with its own soft-deleted row.
CREATE UNIQUE INDEX uq_event_channel_cstar_group_active ON notify.event_channel_cstar_group (channel_setting_id, kind, cstar_group_id)
WHERE
  is_deleted = FALSE;

-- "This channel's groups", the read behind every event page load.
CREATE INDEX idx_event_channel_cstar_group_setting ON notify.event_channel_cstar_group (channel_setting_id)
WHERE
  is_deleted = FALSE;

-- "Which events send to this group?" - the group-side counterpart to
-- idx_event_channel_recipient_address, for support requests and for auditing a group's reach.
CREATE INDEX idx_event_channel_cstar_group_group ON notify.event_channel_cstar_group (cstar_group_id)
WHERE
  is_deleted = FALSE;

CREATE TRIGGER trg_event_channel_cstar_group_updated_at BEFORE
UPDATE ON notify.event_channel_cstar_group FOR EACH ROW
EXECUTE FUNCTION notify.set_updated_at ();

COMMENT ON TABLE notify.event_channel_cstar_group IS 'CSTAR groups an event channel is addressed to, one row per group per recipient list. Only the group ID is stored; the members behind it are resolved from CSTAR at send time, so a group gaining or losing people needs no change here. A list may hold any number of groups, and may hold groups alongside the manually entered addresses in notify.event_channel_recipient.';

COMMENT ON COLUMN notify.event_channel_cstar_group.id IS 'Unique identifier for the group row.';

COMMENT ON COLUMN notify.event_channel_cstar_group.channel_setting_id IS 'Channel setting this group belongs to. Cascade deleted with it.';

COMMENT ON COLUMN notify.event_channel_cstar_group.channel_code IS 'Channel of the parent setting, held identical to it by the composite foreign key to event_channel_setting. Stored here so (channel_code, kind) can reference notify.channel_recipient_kind. Always EMAIL for now.';

COMMENT ON COLUMN notify.event_channel_cstar_group.kind IS 'Which recipient list the group is addressed through, from notify.event_recipient_kind_code. Paired with channel_code against notify.channel_recipient_kind.';

COMMENT ON COLUMN notify.event_channel_cstar_group.cstar_group_id IS 'Identifier of the CSTAR group. Not a foreign key: groups are owned by CSTAR and have no table in this database, so the application validates that every ID belongs to the event''s tenant before writing it. VARCHAR rather than UUID to match how CSTAR-owned identifiers are already stored here (notify_user.external_id, tenant.external_id); the CHECK constraint holds it to the character set the CSTAR client will put in a URL path.';

COMMENT ON COLUMN notify.event_channel_cstar_group.created_at IS 'Timestamp with timezone when the group was added.';

COMMENT ON COLUMN notify.event_channel_cstar_group.created_by IS 'Identifier of the user or process that added this group.';

COMMENT ON COLUMN notify.event_channel_cstar_group.updated_at IS 'Timestamp with timezone when the group row was last updated. Maintained by trg_event_channel_cstar_group_updated_at.';

COMMENT ON COLUMN notify.event_channel_cstar_group.updated_by IS 'Identifier of the user or process that last updated this group.';

COMMENT ON COLUMN notify.event_channel_cstar_group.is_deleted IS 'Soft delete flag. Removing a group sets this rather than deleting the row, so the history table keeps the removal.';

-- Audit history. Which groups an event addresses decides who receives a notification, so every
-- change is recorded. audit_history_preserving_actor() rather than audit_history(): the API sets
-- created_by/updated_by to the caller's IDIR GUID, and the plain function overwrites both (V53).
CREATE TABLE
  notify.event_channel_cstar_group_history (
    h_id UUID DEFAULT gen_random_uuid () NOT NULL PRIMARY KEY,
    target_row_id UUID NOT NULL,
    operation_type CHAR(1) NOT NULL,
    operation_user VARCHAR(200) DEFAULT CURRENT_USER NOT NULL,
    operation_executed_at TIMESTAMPTZ DEFAULT now () NOT NULL,
    data_after_operation JSONB NOT NULL
  );

CREATE INDEX idx_event_channel_cstar_group_history_target_row ON notify.event_channel_cstar_group_history (target_row_id);

CREATE INDEX idx_event_channel_cstar_group_history_timestamp ON notify.event_channel_cstar_group_history (operation_executed_at DESC);

COMMENT ON TABLE notify.event_channel_cstar_group_history IS 'Immutable audit log of changes to event_channel_cstar_group - which groups were added to or removed from an event, and by whom. Removal is a soft delete, so it appears here as an UPDATE.';

CREATE TRIGGER event_channel_cstar_group_audit
AFTER INSERT
OR
UPDATE ON notify.event_channel_cstar_group FOR EACH ROW
EXECUTE FUNCTION notify.audit_history_preserving_actor ('event_channel_cstar_group_history', 'id');

COMMIT;
