
-- Tenant tab -----------------------------------------------------------------
ALTER TABLE notify.tenant_settings
  ADD COLUMN IF NOT EXISTS default_sender_email VARCHAR(64);

ALTER TABLE notify.tenant_settings
  ADD CONSTRAINT chk_tenant_settings_default_sender_email
  CHECK (default_sender_email IS NULL OR default_sender_email ~ '^[A-Za-z0-9._-]{1,64}$');

-- Email tab ------------------------------------------------------------------
ALTER TABLE notify.tenant_settings
  ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE notify.tenant_settings
  ADD COLUMN IF NOT EXISTS reply_to_email VARCHAR(64);

ALTER TABLE notify.tenant_settings
  ADD CONSTRAINT chk_tenant_settings_reply_to_email
  CHECK (reply_to_email IS NULL OR reply_to_email ~ '^[A-Za-z0-9._-]{1,64}$');

ALTER TABLE notify.tenant_settings
  ADD COLUMN IF NOT EXISTS use_custom_email_header BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE notify.tenant_settings
  ADD COLUMN IF NOT EXISTS custom_email_header_title VARCHAR(60);

-- Custom header selected ⇒ a title must be present.
ALTER TABLE notify.tenant_settings
  ADD CONSTRAINT chk_tenant_settings_custom_header
  CHECK (use_custom_email_header = FALSE OR custom_email_header_title IS NOT NULL);

ALTER TABLE notify.tenant_settings
  ADD COLUMN IF NOT EXISTS email_attachments_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- SMS tab --------------------------------------------------------------------
ALTER TABLE notify.tenant_settings
  ADD COLUMN IF NOT EXISTS sms_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE notify.tenant_settings
  ADD COLUMN IF NOT EXISTS include_tenant_name_in_sms BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE notify.tenant_settings
  ADD COLUMN IF NOT EXISTS international_sms_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Column comments (repo convention: comment every column) ---------------------
COMMENT ON COLUMN notify.tenant_settings.default_sender_email IS 'Local part (before @gov.bc.ca) of the tenant-wide default sending/from email address. Max 64 chars; letters, digits, ., -, _.';
COMMENT ON COLUMN notify.tenant_settings.email_notifications_enabled IS 'When false, the tenant cannot send email notifications.';
COMMENT ON COLUMN notify.tenant_settings.reply_to_email IS 'Optional local part (before @gov.bc.ca) of the default reply-to address. Can be overridden per event.';
COMMENT ON COLUMN notify.tenant_settings.use_custom_email_header IS 'When true, custom_email_header_title is used instead of the tenant default header title.';
COMMENT ON COLUMN notify.tenant_settings.custom_email_header_title IS 'Custom email header title (max 60 chars). Used only when use_custom_email_header is true.';
COMMENT ON COLUMN notify.tenant_settings.email_attachments_enabled IS 'When true, files may be included as attachments in outgoing emails for this tenant.';
COMMENT ON COLUMN notify.tenant_settings.sms_notifications_enabled IS 'When false, the tenant cannot send SMS notifications.';
COMMENT ON COLUMN notify.tenant_settings.include_tenant_name_in_sms IS 'When true, SMS messages are prefixed with the tenant name.';
COMMENT ON COLUMN notify.tenant_settings.international_sms_enabled IS 'When true, the tenant may send SMS to international numbers.';
