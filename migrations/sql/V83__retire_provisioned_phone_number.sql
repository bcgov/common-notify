-- ============================================================================
-- Retire provisioned_phone_number (V60)
--
-- The Events page's own pool of tenant SMS numbers. It was never populated, and
-- V82's sms_number / tenant_sms_number now say which number a tenant sends from.
-- Events show the sender a send actually uses: the tenant's number for the
-- active provider, else that provider's default. With a sender always
-- resolvable, activating an event's SMS channel no longer depends on one being
-- set, so event_channel_setting loses from_phone_number_id.
--
-- event_channel_setting_history keeps its rows: it stores JSONB snapshots, so
-- older snapshots simply still carry the dropped column.
-- ============================================================================
BEGIN;

DROP TRIGGER IF EXISTS trg_provisioned_phone_number_release ON notify.provisioned_phone_number;
DROP FUNCTION IF EXISTS notify.check_phone_number_release ();

-- Both name from_phone_number_id; recreated below without it.
ALTER TABLE notify.event_channel_setting
  DROP CONSTRAINT IF EXISTS chk_event_channel_setting_shape,
  DROP CONSTRAINT IF EXISTS chk_event_channel_setting_active_complete,
  DROP CONSTRAINT IF EXISTS fk_event_channel_setting_number;

DROP INDEX IF EXISTS notify.idx_event_channel_setting_number;

ALTER TABLE notify.event_channel_setting
  DROP COLUMN IF EXISTS from_phone_number_id;

ALTER TABLE notify.event_channel_setting
  ADD CONSTRAINT chk_event_channel_setting_shape CHECK (
    channel_code = 'EMAIL'
    OR (
      channel_code = 'SMS'
      AND sender_email IS NULL
      AND use_custom_header = FALSE
      AND header_logo_id IS NULL
      AND header_title IS NULL
    )
  ),
  ADD CONSTRAINT chk_event_channel_setting_active_complete CHECK (
    active = FALSE
    OR (
      template_id IS NOT NULL
      AND (
        channel_code = 'SMS'
        OR (
          channel_code = 'EMAIL'
          AND sender_email IS NOT NULL
        )
      )
    )
  );

COMMENT ON TABLE notify.event_channel_setting IS 'Per-channel configuration for an event, one row per (event, channel). Backs the Email settings and SMS settings tabs. EMAIL rows carry sender_email and header values; SMS rows send from the tenant''s SMS number (notify.tenant_sms_number), so carry no sender. Recipients live in notify.event_channel_recipient.';
COMMENT ON COLUMN notify.event_channel_setting.active IS 'Active indicator for the channel. When false the event does not send on this channel. Cannot be set true until the template, and for EMAIL the sender_email, are populated; the matching "at least one recipient" rule is enforced by the application, since recipients are rows in another table.';

DROP TABLE IF EXISTS notify.provisioned_phone_number_history;
-- Its own triggers go with it.
DROP TABLE IF EXISTS notify.provisioned_phone_number;
DROP FUNCTION IF EXISTS notify.check_phone_number_allocation ();

COMMIT;
