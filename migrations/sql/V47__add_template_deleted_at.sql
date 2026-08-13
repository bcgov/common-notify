ALTER TABLE notify.template
ADD COLUMN deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN notify.template.deleted_at IS 'Timestamp when the template was soft-deleted.';
