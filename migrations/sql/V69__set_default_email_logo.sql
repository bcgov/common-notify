ALTER TABLE notify.email_logo
  ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN notify.email_logo.is_default IS 'System default used when no email logo is selected.';

UPDATE notify.email_logo
SET is_default = TRUE
WHERE id = (
  SELECT id FROM notify.email_logo
  WHERE file_key = 'logos/BCID_H_RGB_pos.svg'
    AND source_code = 'SYSTEM' AND status_code = 'APPROVED' AND is_deleted = FALSE
  ORDER BY created_at, id
  LIMIT 1
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM notify.email_logo WHERE is_default) THEN
    RAISE EXCEPTION 'Main BC Mark must be seeded before configuring the default email logo';
  END IF;
END $$;

CREATE UNIQUE INDEX uq_email_logo_default ON notify.email_logo (is_default) WHERE is_default;

ALTER TABLE notify.email_logo ADD CONSTRAINT chk_email_logo_default_approved
  CHECK (NOT is_default OR (status_code = 'APPROVED' AND NOT is_deleted AND source_code = 'SYSTEM'));

UPDATE notify.tenant_settings
SET email_logo_id = (SELECT id FROM notify.email_logo WHERE is_default)
WHERE email_logo_id IS NULL;
