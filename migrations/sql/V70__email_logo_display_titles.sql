ALTER TABLE notify.email_logo ADD COLUMN display_title VARCHAR(255);

COMMENT ON COLUMN notify.email_logo.display_title IS
  'Public-facing organization title displayed beside the email logo; independent of picker labels.';

UPDATE notify.email_logo
SET display_title = CASE
  WHEN is_default THEN 'Government of British Columbia'
  ELSE name
END;

COMMENT ON COLUMN notify.tenant_settings.use_custom_email_header IS
  'When true, show the selected logo display title beside the logo. False uses the logo only.';
