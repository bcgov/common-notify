-- Header titles now come from email_logo.display_title (V70), not a tenant-entered title.
-- The V49 constraint otherwise rejects logo-and-title mode when the legacy title is NULL.
ALTER TABLE notify.tenant_settings
  DROP CONSTRAINT chk_tenant_settings_custom_header;

-- Preserve existing values for compatibility; the current header renderer does not use them.
COMMENT ON COLUMN notify.tenant_settings.custom_email_header_title IS
  'Legacy tenant-entered header title. Retained for compatibility; current email headers use email_logo.display_title.';
