-- V60: CSTAR group recipients on an event's email channel.
--
-- The Email settings tab can address a notification to CSTAR groups rather than (or as well as)
-- typed-in addresses. Only the group IDs are stored here; the members and their email addresses
-- live in CSTAR and are resolved at send time, so a group's membership changing is picked up
-- without touching the event.
--
-- Stored the same way as the "to"/cc/bcc address lists this table already carries: one
-- comma-separated column per recipient field, EMAIL only. Not foreign keys - groups are
-- CSTAR-owned and have no table in this database. The application validates that every ID
-- saved here belongs to the event's tenant before writing it.
BEGIN;

ALTER TABLE notify.event_channel_setting
ADD COLUMN cstar_group_ids_to VARCHAR(10000),
ADD COLUMN cstar_group_ids_cc VARCHAR(10000),
ADD COLUMN cstar_group_ids_bcc VARCHAR(10000);

COMMENT ON COLUMN notify.event_channel_setting.cstar_group_ids_to IS 'Comma-separated CSTAR group UUIDs whose members are addressed in the To field. EMAIL only; NULL on SMS rows. Resolved to member email addresses at send time via the CSTAR API, so membership changes need no update here. Not a foreign key: groups are owned by CSTAR.';

COMMENT ON COLUMN notify.event_channel_setting.cstar_group_ids_cc IS 'Comma-separated CSTAR group UUIDs whose members are addressed in the CC field. EMAIL only; NULL on SMS rows.';

COMMENT ON COLUMN notify.event_channel_setting.cstar_group_ids_bcc IS 'Comma-separated CSTAR group UUIDs whose members are addressed in the BCC field. EMAIL only; NULL on SMS rows.';

-- Like the address lists, a group list is either absent or non-blank; never an empty string.
ALTER TABLE notify.event_channel_setting
ADD CONSTRAINT chk_event_channel_setting_cstar_group_ids_to CHECK (
  cstar_group_ids_to IS NULL
  OR btrim(cstar_group_ids_to) <> ''
),
ADD CONSTRAINT chk_event_channel_setting_cstar_group_ids_cc CHECK (
  cstar_group_ids_cc IS NULL
  OR btrim(cstar_group_ids_cc) <> ''
),
ADD CONSTRAINT chk_event_channel_setting_cstar_group_ids_bcc CHECK (
  cstar_group_ids_bcc IS NULL
  OR btrim(cstar_group_ids_bcc) <> ''
);

-- Group recipients are an email-channel concept, so they join sender_email/cc/bcc/header_* in
-- the list of columns an SMS row may not carry.
ALTER TABLE notify.event_channel_setting
DROP CONSTRAINT chk_event_channel_setting_shape;

ALTER TABLE notify.event_channel_setting
ADD CONSTRAINT chk_event_channel_setting_shape CHECK (
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
    AND cstar_group_ids_to IS NULL
    AND cstar_group_ids_cc IS NULL
    AND cstar_group_ids_bcc IS NULL
  )
);

-- Addressing an email channel to a CSTAR group is a complete recipient choice on its own, so
-- an EMAIL row no longer needs a typed-in "to" list to be activated - one or the other will do.
-- CC/BCC groups do not count, mirroring cc/bcc addresses: neither has ever satisfied this.
-- SMS is unchanged and still requires "to".
ALTER TABLE notify.event_channel_setting
DROP CONSTRAINT chk_event_channel_setting_active_complete;

ALTER TABLE notify.event_channel_setting
ADD CONSTRAINT chk_event_channel_setting_active_complete CHECK (
  active = FALSE
  OR (
    template_id IS NOT NULL
    AND (
      (
        channel_code = 'EMAIL'
        AND sender_email IS NOT NULL
        AND (
          "to" IS NOT NULL
          OR cstar_group_ids_to IS NOT NULL
        )
      )
      OR (
        channel_code = 'SMS'
        AND from_phone_number_id IS NOT NULL
        AND "to" IS NOT NULL
      )
    )
  )
);

COMMIT;
