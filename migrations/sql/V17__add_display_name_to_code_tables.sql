-- V17__add_display_name_to_code_tables.sql
-- Add display_name column to all code tables for UI rendering
-- display_name contains sentence-case version of the code for frontend display
-- Add display_name column to notification_status_code table
ALTER TABLE notification_status_code
ADD COLUMN display_name VARCHAR(100) NOT NULL DEFAULT '';

COMMENT ON COLUMN notification_status_code.display_name IS 'Sentence-case display name for UI rendering (e.g., "Queued", "Processing"). Used in dropdowns and forms.';

-- Populate display_name for notification status codes
UPDATE notification_status_code
SET
  display_name = 'Queued'
WHERE
  code = 'queued';

UPDATE notification_status_code
SET
  display_name = 'Processing'
WHERE
  code = 'processing';

UPDATE notification_status_code
SET
  display_name = 'Completed'
WHERE
  code = 'completed';

UPDATE notification_status_code
SET
  display_name = 'Failed'
WHERE
  code = 'failed';

UPDATE notification_status_code
SET
  display_name = 'Accepted'
WHERE
  code = 'accepted';

UPDATE notification_status_code
SET
  display_name = 'Scheduled'
WHERE
  code = 'scheduled';

UPDATE notification_status_code
SET
  display_name = 'Sending'
WHERE
  code = 'sending';

-- Add display_name column to notification_channel_code table
ALTER TABLE notify.notification_channel_code
ADD COLUMN display_name VARCHAR(100) NOT NULL DEFAULT '';

COMMENT ON COLUMN notify.notification_channel_code.display_name IS 'Sentence-case display name for UI rendering (e.g., "Email", "SMS"). Used in dropdowns and forms.';

-- Populate display_name for notification channel codes
UPDATE notify.notification_channel_code
SET
  display_name = 'Email'
WHERE
  channel_code = 'EMAIL';

UPDATE notify.notification_channel_code
SET
  display_name = 'SMS'
WHERE
  channel_code = 'SMS';

-- Add display_name column to notification_event_type_code table
ALTER TABLE notify.notification_event_type_code
ADD COLUMN display_name VARCHAR(100) NOT NULL DEFAULT '';

COMMENT ON COLUMN notify.notification_event_type_code.display_name IS 'Sentence-case display name for UI rendering (e.g., "Password Reset", "Invoice Sent"). Used in dropdowns and forms.';

-- Populate display_name for notification event type codes
UPDATE notify.notification_event_type_code
SET
  display_name = 'Password Reset'
WHERE
  event_type_code = 'PASSWORD_RESET';

UPDATE notify.notification_event_type_code
SET
  display_name = 'Invoice Sent'
WHERE
  event_type_code = 'INVOICE_SENT';

UPDATE notify.notification_event_type_code
SET
  display_name = 'Account Created'
WHERE
  event_type_code = 'ACCOUNT_CREATED';

-- Add display_name column to template_engine_code table
ALTER TABLE notify.template_engine_code
ADD COLUMN display_name VARCHAR(100) NOT NULL DEFAULT '';

COMMENT ON COLUMN notify.template_engine_code.display_name IS 'Sentence-case display name for UI rendering (e.g., "Handlebars", "Mustache"). Used in dropdowns and forms.';

-- Populate display_name for template engine codes
UPDATE notify.template_engine_code
SET
  display_name = 'Legacy GC Notify'
WHERE
  engine_code = 'legacy_gc_notify';

UPDATE notify.template_engine_code
SET
  display_name = 'Handlebars'
WHERE
  engine_code = 'handlebars';

UPDATE notify.template_engine_code
SET
  display_name = 'Mustache'
WHERE
  engine_code = 'mustache';

UPDATE notify.template_engine_code
SET
  display_name = 'EJS'
WHERE
  engine_code = 'ejs';

-- Add NOT NULL constraint after population (ensures all new codes must have display_name)
ALTER TABLE notify.notification_channel_code
ALTER COLUMN display_name
DROP DEFAULT,
ALTER COLUMN display_name
SET
  NOT NULL;

ALTER TABLE notify.notification_event_type_code
ALTER COLUMN display_name
DROP DEFAULT,
ALTER COLUMN display_name
SET
  NOT NULL;

ALTER TABLE notify.template_engine_code
ALTER COLUMN display_name
DROP DEFAULT,
ALTER COLUMN display_name
SET
  NOT NULL;
