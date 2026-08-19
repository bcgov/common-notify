-- Replace the single-valued channel_code (VARCHAR + FK to notification_channel_code) with a
-- multi-valued channel_codes JSONB array, so a request can record every channel it targeted
-- (e.g. ["EMAIL","SMS"]) instead of simply storing the string 'MULTIPLE'.

-- Add the new JSONB column
ALTER TABLE notify.notification_request
ADD COLUMN channel_codes JSONB NULL;

COMMENT ON COLUMN notify.notification_request.channel_codes IS 'Channels this request targeted, as a JSONB array of channel codes (e.g. ["EMAIL","SMS"]). Values reference notification_channel_code.channel_code but are not FK-enforced.';

-- Backfill existing rows.
UPDATE notify.notification_request
SET channel_codes = COALESCE(
  (
    SELECT jsonb_agg(code)
    FROM (
      SELECT 'EMAIL'::text AS code
      WHERE jsonb_typeof(recipients -> 'email') = 'array'
        AND jsonb_array_length(recipients -> 'email') > 0
      UNION ALL
      SELECT 'SMS'
      WHERE jsonb_typeof(recipients -> 'sms') = 'array'
        AND jsonb_array_length(recipients -> 'sms') > 0
      UNION ALL
      SELECT 'MSGAPP'
      WHERE jsonb_typeof(recipients -> 'msgApp') = 'array'
        AND jsonb_array_length(recipients -> 'msgApp') > 0
    ) derived
  ),
  CASE
    WHEN channel_code = 'MULTIPLE' THEN '["EMAIL","SMS"]'::jsonb
    WHEN channel_code IS NOT NULL THEN jsonb_build_array(channel_code)
    ELSE NULL
  END
)
WHERE channel_code IS NOT NULL
  OR recipients IS NOT NULL;

-- Drop the previous channel column as well as its index and foreign key.
DROP INDEX IF EXISTS notify.idx_notification_request_channel;

ALTER TABLE notify.notification_request
DROP CONSTRAINT IF EXISTS fk_notification_channel_code;

ALTER TABLE notify.notification_request
DROP COLUMN channel_code;

-- Index for channel containment lookups (jsonb_exists_any / the ?| operator use a GIN index).
CREATE INDEX idx_notification_request_channel_codes ON notify.notification_request USING GIN (channel_codes)
WHERE
  channel_codes IS NOT NULL;
