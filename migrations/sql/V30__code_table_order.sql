----
-- feature_flag_code
----
-- Add sort order column to feature_flag_code table
ALTER TABLE notify.feature_flag_code ADD COLUMN IF NOT EXISTS sort_order INTEGER;
-- Add sort order
UPDATE notify.feature_flag_code SET sort_order = 10 WHERE code='sms_notifications';
UPDATE notify.feature_flag_code SET sort_order = 20 WHERE code='sse_notifications';
-- Make the column non-optional
ALTER TABLE notify.feature_flag_code 
ALTER COLUMN sort_order SET NOT NULL,
ALTER COLUMN sort_order SET DEFAULT 999;

----
-- notification_channel_code
----
-- Add sort order column to notification_channel_code table
ALTER TABLE notify.notification_channel_code ADD COLUMN IF NOT EXISTS sort_order INTEGER;
-- Add sort order
UPDATE notify.notification_channel_code SET sort_order = 10 WHERE channel_code='EMAIL';
UPDATE notify.notification_channel_code SET sort_order = 20 WHERE channel_code='SMS';
UPDATE notify.notification_channel_code SET sort_order = 30 WHERE channel_code='MSGAPP';
UPDATE notify.notification_channel_code SET sort_order = 40 WHERE channel_code='MULTIPLE';
-- Make the column non-optional
ALTER TABLE notify.notification_channel_code 
ALTER COLUMN sort_order SET NOT NULL,
ALTER COLUMN sort_order SET DEFAULT 999;

----
-- notification_event_type_code
----
-- Add sort order column to notification_event_type_code table
ALTER TABLE notify.notification_event_type_code ADD COLUMN IF NOT EXISTS sort_order INTEGER;
-- Add sort order
UPDATE notify.notification_event_type_code SET sort_order = 10 WHERE event_type_code='PASSWORD_RESET';
UPDATE notify.notification_event_type_code SET sort_order = 20 WHERE event_type_code='INVOICE_SENT';
UPDATE notify.notification_event_type_code SET sort_order = 30 WHERE event_type_code='ACCOUNT_CREATED';
-- Make the column non-optional
ALTER TABLE notify.notification_event_type_code 
ALTER COLUMN sort_order SET NOT NULL,
ALTER COLUMN sort_order SET DEFAULT 999;

----
-- notification_status_code
----
-- Add sort order column to notification_status_code table
ALTER TABLE notify.notification_status_code ADD COLUMN IF NOT EXISTS sort_order INTEGER;
-- Add sort order
UPDATE notify.notification_status_code SET sort_order = 10 WHERE code='accepted';
UPDATE notify.notification_status_code SET sort_order = 20 WHERE code='pending';
UPDATE notify.notification_status_code SET sort_order = 30 WHERE code='queued';
UPDATE notify.notification_status_code SET sort_order = 40 WHERE code='processing';
UPDATE notify.notification_status_code SET sort_order = 50 WHERE code='scheduled';
UPDATE notify.notification_status_code SET sort_order = 60 WHERE code='sending';
UPDATE notify.notification_status_code SET sort_order = 70 WHERE code='completed';
UPDATE notify.notification_status_code SET sort_order = 80 WHERE code='failed';
UPDATE notify.notification_status_code SET sort_order = 90 WHERE code='cancelled';
UPDATE notify.notification_status_code SET sort_order = 100 WHERE code='quarantined';
-- Make the column non-optional
ALTER TABLE notify.notification_status_code 
ALTER COLUMN sort_order SET NOT NULL,
ALTER COLUMN sort_order SET DEFAULT 999;
-- Bugfix cancelled having no display_name value
UPDATE notify.notification_status_code SET display_name='Cancelled' WHERE code='cancelled';

----
-- template_engine_code
----
-- Add sort order column to template_engine_code table
ALTER TABLE notify.template_engine_code ADD COLUMN IF NOT EXISTS sort_order INTEGER;
-- Remove ejs code as we are no longer supporting it
DELETE FROM template_engine_code WHERE engine_code='ejs';
-- Add sort order
UPDATE notify.template_engine_code SET sort_order = 10 WHERE engine_code='handlebars';
UPDATE notify.template_engine_code SET sort_order = 20 WHERE engine_code='mustache';
UPDATE notify.template_engine_code SET sort_order = 30 WHERE engine_code='legacy_gc_notify';
-- Make the column non-optional
ALTER TABLE notify.template_engine_code 
ALTER COLUMN sort_order SET NOT NULL,
ALTER COLUMN sort_order SET DEFAULT 999;

----
-- tenant_status_code
----
-- Add sort order column to tenant_status_code table
ALTER TABLE notify.tenant_status_code ADD COLUMN IF NOT EXISTS sort_order INTEGER;
-- Add sort order
UPDATE notify.tenant_status_code SET sort_order = 10 WHERE code='active';
UPDATE notify.tenant_status_code SET sort_order = 20 WHERE code='disabled';
-- Make the column non-optional
ALTER TABLE notify.tenant_status_code 
ALTER COLUMN sort_order SET NOT NULL,
ALTER COLUMN sort_order SET DEFAULT 999;
