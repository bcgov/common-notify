-- V47: SMS templates are plain text, not markdown.
--
-- SMS carries no formatting: the body is sent to the provider exactly as written, with no
-- markdown conversion and no HTML escaping of personalisation values. Templates created before
-- this were stored with body_type = 'markdown' (the default for every non-MJML template), which
-- misdescribed what is actually sent. New SMS templates are stored as 'text'; this aligns the
-- rows that already exist.
--
-- Rendering no longer reads body_type for SMS, so this is a correctness/consistency fix to the
-- stored record rather than a behaviour change.
UPDATE notify.template
SET
  body_type = 'text'
WHERE
  channel_code = 'SMS'
  AND body_type IS DISTINCT FROM 'text';

UPDATE notify.template_version
SET
  body_type = 'text'
WHERE
  channel_code = 'SMS'
  AND body_type IS DISTINCT FROM 'text';
